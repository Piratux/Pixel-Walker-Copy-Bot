import { PWApiClient, PWGameClient } from 'pw-js-api'
import { GENERAL_CONSTANTS } from '@/constants/general.ts'
import { Block, DeserialisedStructure, PWGameWorldHelper } from 'pw-js-world'
import { placeWorldDataBlocks } from '@/services/WorldService.ts'
import { vec2 } from '@basementuniverse/vec'
import { getPwGameWorldHelper } from '@/stores/PWClientStore.ts'

export async function pwAuthenticate(pwApiClient: PWApiClient): Promise<void> {
  const authenticationResult = await pwApiClient.authenticate()

  if ('token' in authenticationResult) {
    return
  }

  if ('message' in authenticationResult) {
    throw new Error(authenticationResult.message)
  } else {
    throw new Error(GENERAL_CONSTANTS.GENERIC_ERROR)
  }
}

export async function pwJoinWorld(pwGameClient: PWGameClient, worldId: string): Promise<void> {
  try {
    await pwGameClient.joinWorld(worldId)
  } catch (e) {
    throw new Error('Failed to join world. Check world ID. ' + (e as Error).message)
  }
}

export function pwCreateEmptyBlocks(pwGameWorldHelper: PWGameWorldHelper): DeserialisedStructure {
  const width = pwGameWorldHelper.width
  const height = pwGameWorldHelper.height
  const pwBlock3DArray: [Block[][], Block[][]] = [[], []]
  for (let l = 0; l < 2; l++) {
    pwBlock3DArray[l] = []
    for (let x = 0; x < width; x++) {
      pwBlock3DArray[l][x] = []
      for (let y = 0; y < height; y++) {
        pwBlock3DArray[l][x][y] = new Block(0)
      }
    }
  }
  return new DeserialisedStructure(pwBlock3DArray, { width: width, height: height })
}

export async function pwClearWorld(): Promise<void> {
  const emptyBlocks = pwCreateEmptyBlocks(getPwGameWorldHelper())
  await placeWorldDataBlocks(emptyBlocks, vec2(0, 0))
}
