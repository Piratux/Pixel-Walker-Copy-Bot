import { setTimeout as workerSetTimeout } from 'worker-timers'

/**
 * https://stackoverflow.com/questions/951021/what-is-the-javascript-version-of-sleep
 */
export function sleep(ms: number = 0): Promise<void> {
  return new Promise((resolve) => {
    workerSetTimeout(resolve, ms)
  })
}
