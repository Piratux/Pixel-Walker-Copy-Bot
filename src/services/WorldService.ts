import { Block, createBlockPackets, DeserialisedStructure, Point, SendableBlockPacket } from 'pw-js-world'
import {
  getPwBlocksById,
  getPwBlocksByName,
  getPwGameClient,
  getPwGameWorldHelper,
  usePWClientStore,
} from '@/stores/PWClientStore.ts'
import { WorldBlock } from '@/types/WorldBlock.ts'
import { PwBlockName } from '@/gen/PwBlockName.ts'
import { sleep } from '@/utils/Sleep.ts'
import { TOTAL_PW_LAYERS } from '@/constants/General.ts'
import { vec2 } from '@basementuniverse/vec'
import { cloneDeep } from 'lodash-es'

export function getBlockAt(pos: Point, layer: number): Block {
  try {
    return getPwGameWorldHelper().getBlockAt(pos.x, pos.y, layer)
  } catch {
    return new Block(0)
  }
}

export async function placeMultipleBlocks(worldBlocks: WorldBlock[]) {
  const packets = createBlockPackets(worldBlocks)

  return await placePackets(packets, worldBlocks.length)
}

export async function placeWorldDataBlocks(worldData: DeserialisedStructure, pos: Point): Promise<boolean> {
  const packets: SendableBlockPacket[] = worldData.toPackets(pos.x, pos.y)

  return await placePackets(packets, worldData.width * worldData.height * TOTAL_PW_LAYERS)
}

async function placePackets(packets: SendableBlockPacket[], blockCount: number): Promise<boolean> {
  // TODO: use packet count instead of block count
  usePWClientStore().totalBlocksLeftToReceiveFromWorldImport = blockCount
  let lastTotalBlocksLeftToReceiveFromWorldImportValue = usePWClientStore().totalBlocksLeftToReceiveFromWorldImport

  for (const packet of packets) {
    placeBlockPacket(packet)
  }

  const TOTAL_WAIT_ATTEMPTS_BEFORE_ASSUMING_ERROR = 5
  let total_attempts = 0
  while (total_attempts < TOTAL_WAIT_ATTEMPTS_BEFORE_ASSUMING_ERROR) {
    if (usePWClientStore().totalBlocksLeftToReceiveFromWorldImport === 0) {
      return true
    }

    if (
      usePWClientStore().totalBlocksLeftToReceiveFromWorldImport === lastTotalBlocksLeftToReceiveFromWorldImportValue
    ) {
      total_attempts++
    } else {
      total_attempts = 0
    }

    lastTotalBlocksLeftToReceiveFromWorldImportValue = usePWClientStore().totalBlocksLeftToReceiveFromWorldImport

    await sleep(1000)
  }
  return false
}

export function placeBlockPacket(blockPacket: SendableBlockPacket) {
  getPwGameClient().send('worldBlockPlacedPacket', blockPacket)
}

export function getBlockName(pwBlockId: number): PwBlockName {
  return getPwBlocksById()[pwBlockId].PaletteId.toUpperCase() as PwBlockName
}

export function getBlockId(pwBlockName: PwBlockName): number {
  return getPwBlocksByName()[pwBlockName].Id
}

export function convertDeserializedStructureToWorldBlocks(blocks: DeserialisedStructure, pos: vec2): WorldBlock[] {
  const resultBlocks: WorldBlock[] = []
  for (let layer = 0; layer < TOTAL_PW_LAYERS; layer++) {
    for (let y = 0; y < blocks.height; y++) {
      for (let x = 0; x < blocks.width; x++) {
        const worldBlock = {
          block: cloneDeep(blocks.blocks[layer][x][y]),
          layer: layer,
          pos: vec2(x + pos.x, y + pos.y),
        }
        resultBlocks.push(worldBlock)
      }
    }
  }
  return resultBlocks
}
