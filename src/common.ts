import {
  CollectionManagementClient,
  JobManagementClient,
  SDKModels,
  SDKModelsV1,
  UserManagementClient,
  WorkflowManagementClient
} from '@jupiterbak/ayx-node'
//import tryer from 'tryer'
import fs from 'fs'
import path from 'path'

export interface AYXDeployResults {
  collection: SDKModels.CollectionView[]
  workflows: SDKModelsV1.WorkflowApiView[]
}

export async function wait(milliseconds: number): Promise<string> {
  return new Promise(resolve => {
    if (isNaN(milliseconds)) {
      throw new Error('milliseconds not a number')
    }

    setTimeout(() => resolve('done!'), milliseconds)
  })
}

export function getAllFiles(dirPath: string, arrayOfFiles: string[]): string[] {
  const files = fs.readdirSync(dirPath).filter(value => !value.startsWith('.'))
  arrayOfFiles = arrayOfFiles || []
  // eslint-disable-next-line github/array-foreach
  files.forEach(file => {
    if (fs.statSync(`${dirPath}/${file}`).isDirectory()) {
      arrayOfFiles = getAllFiles(`${dirPath}/${file}`, arrayOfFiles)
    } else {
      arrayOfFiles.push(path.join(dirPath, '/', file))
    }
  })
  return arrayOfFiles
}

export async function main(
  cClient: CollectionManagementClient,
  wClient: WorkflowManagementClient,
  jClient: JobManagementClient,
  userClient: UserManagementClient,
  userMail: string,
  folderToSync: string
): Promise<AYXDeployResults> {
  return new Promise(async resolve => {
    // list all collections
    const collections = await cClient.GetCollections('Full')

    // Get a target user
    const users = await userClient.GetUsers({email: userMail})
    const targetUser = users[0]

    const dirAbsolutePath = path.resolve(folderToSync)
    if (!fs.existsSync(dirAbsolutePath)) {
      return {
        collection: [],
        workflows: []
      }
    }
    const _files = fs
      .readdirSync(folderToSync)
      .filter(value => !value.startsWith('.'))
    _files.map(async file => {
      if (fs.statSync(`${folderToSync}/${file}`).isDirectory()) {
        // Check if corresponding collection to the folder exists
        const target_collections = collections
          .filter(x => {
            let _a
            return (_a = x.name) === null || _a === void 0
              ? void 0
              : _a.startsWith(file)
          })
          .flat()
        let target_collection: SDKModels.CollectionView
        if (target_collections.length === 0) {
          // Corresponding collection do not exist. Create it
          const createdCollectionId = await cClient.CreateCollection({
            name: file
          })
          target_collection = await cClient.GetCollection(createdCollectionId)
        } else {
          target_collection = await cClient.GetCollection(
            target_collections[0].id
          )
        }

        // Get all the workflows in this folder and its subfolders
        const arrayOfWorkflowPackages = getAllFiles(
          `${folderToSync}/${file}`,
          []
        ).filter(x =>
          x === null || x === void 0 ? void 0 : x.endsWith('.yxzp')
        )
        // Get all the macros in this folder and its subfolders
        // const arrayOfMacrosPackages = getAllFiles(
        //   `${folderToSync}/${file}`,
        //   []
        // ).filter(x =>
        //   x === null || x === void 0 ? void 0 : x.endsWith('.yxmc')
        // )
        // For each workflows/app check if workflow exists
        arrayOfWorkflowPackages.map(async w => {
          const workflowName = path.basename(w)
          const _workflows = await wClient.GetWorkflows({name: workflowName})
          let _workflow: SDKModels.WorkflowView
          if (_workflows.length === 0) {
            // Workflow do not exist, create a new one
            const dummyWorkflowFileBuffer = fs.readFileSync(w, {
              flag: 'r',
              encoding: null
            })
            const createdWorkflowId = await wClient.CreateWorkflow({
              file: Buffer.from(dummyWorkflowFileBuffer),
              name: `${workflowName}`,
              ownerId: targetUser.id,
              isPublic: false,
              isReadyForMigration: false,
              othersMayDownload: true,
              othersCanExecute: true,
              executionMode:
                SDKModels.UpdateWorkflowContract.ExecutionModeEnum.Standard.toString(),
              workflowCredentialType:
                SDKModels.UpdateWorkflowContract.WorkflowCredentialTypeEnum.Default.toString(),
              comments: 'uploaded by github action ayx-server-deploy'
            })
            // Read newly created workflow
            _workflow = await wClient.GetWorkflow(createdWorkflowId)
          } else {
            // Workflow already exists, create a new version
            const updatedWorkflow = _workflows[0]
            const dummyWorkflowFileBuffer = fs.readFileSync(w, {
              flag: 'r',
              encoding: null
            })
            // Create new Version
            _workflow = await wClient.AddVersionToWorkflow(updatedWorkflow.id, {
              file: Buffer.from(dummyWorkflowFileBuffer),
              name: updatedWorkflow.name,
              ownerId: updatedWorkflow.ownerId,
              othersMayDownload: true,
              othersCanExecute: true,
              makePublished: false,
              executionMode: updatedWorkflow.executionMode
                ? updatedWorkflow.executionMode.toString()
                : SDKModels.WorkflowView.ExecutionModeEnum.Standard.toString(),
              workflowCredentialType:
                SDKModels.UpdateWorkflowContract.WorkflowCredentialTypeEnum.Default.toString()
            })
          }

          // Check that workflow is added into collection
          const wContaineds = target_collection.workflowIds?.filter(
            col => col === _workflow.id
          )
          if (wContaineds?.length === 0) {
            // workflow do not exists in collection, add it
            await cClient.AddWorkflowToCollection(target_collection.id, {
              workflowId: _workflow.id
            })
          }

          resolve({
            collection: [],
            workflows: []
          })
        })
      }
    })
  })

  // return new Promise(async resolve => {
  //   // list and filter the collectionc by name
  //   const collectionIds = (await cClient.GetCollections('Full'))
  //     .filter(x => {
  //       let _a
  //       return (_a = x.name) === null || _a === void 0
  //         ? void 0
  //         : _a.startsWith(collectionName)
  //     })
  //     .map(col => {
  //       return col.id
  //     })
  //     .flat()

  //   // Get all the workflows
  //   const collections = await Promise.all(
  //     collectionIds.map(async col_id => {
  //       const col = await cClient.GetCollection(col_id)
  //       return col
  //     })
  //   )

  //   // get the workflow Ids to post a new Job
  //   const workflowIds = collections
  //     .map(col => {
  //       return col.workflowIds
  //     })
  //     .flat()

  //   // get the workflows informations
  //   const workflows: SDKModels.WorkflowView[] = await Promise.all(
  //     workflowIds.map(async wId => {
  //       const workflow = await wClient.GetWorkflow(String(wId))
  //       return workflow
  //     })
  //   )
  //   // Post new Jobs
  //   const questions = JSON.parse(args)

  //   const jobs = await Promise.all(
  //     workflowIds.map(async workflow => {
  //       const job = await wClient.PostNewJobV1(String(workflow), {
  //         questions
  //       })
  //       return job
  //     })
  //   )

  //   let completed = false
  //   let statuses: SDKModelsV1.JobApiView[] = []
  //   tryer({
  //     action: async (done: () => void) => {
  //       statuses = await Promise.all(
  //         jobs.map(async job => {
  //           const status = await jClient.GetJobDetailsV1(String(job.id))
  //           return status
  //         })
  //       )

  //       const unfinished_jobs = statuses.filter(
  //         val => val.status === 'Queued' || val.status === 'Running'
  //       )
  //       completed = unfinished_jobs.length === 0

  //       done()
  //     },
  //     until: () => completed,
  //     pass: async () => {
  //       resolve({workflows, statuses})
  //     },
  //     interval: 10000,
  //     limit: -1
  //   })
  // })
}
