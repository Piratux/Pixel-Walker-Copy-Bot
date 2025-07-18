import {
  Block,
  BufferReader,
  createBlockPackets,
  DeserialisedStructure,
  LayerType,
  Point,
  SendableBlockPacket,
} from 'pw-js-world'
import {
  getPwBlocksByPwId,
  getPwBlocksByPwName,
  getPwGameClient,
  getPwGameWorldHelper,
  usePWClientStore,
} from '@/store/PWClientStore.ts'
import { WorldBlock } from '@/type/WorldBlock.ts'
import { PwBlockName } from '@/gen/PwBlockName.ts'
import { sleep } from '@/util/Sleep.ts'
import { TOTAL_PW_LAYERS } from '@/constant/General.ts'
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
  if (worldBlocks.length === 0) {
    return
  }

  const packets = createBlockPackets(worldBlocks)

  return await placePackets(packets, worldBlocks.length)
}

export async function placeWorldDataBlocks(worldData: DeserialisedStructure, pos: Point): Promise<boolean> {
  const packets: SendableBlockPacket[] = worldData.toPackets(pos.x, pos.y)

  return await placePackets(packets, worldData.width * worldData.height * TOTAL_PW_LAYERS)
}

export async function placeLayerDataBlocks(
  worldData: DeserialisedStructure,
  pos: Point,
  layer: LayerType,
): Promise<boolean> {
  const packets: SendableBlockPacket[] = worldData
    .toPackets(pos.x, pos.y)
    .filter((packet) => (packet.layer as LayerType) === layer)

  return await placePackets(packets, worldData.width * worldData.height)
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

function updateBlockMap(blockPacket: SendableBlockPacket) {
  const { positions, layer, blockId, extraFields } = blockPacket

  const args = extraFields ? Block.deserializeArgs(BufferReader.from(extraFields)) : undefined

  for (let i = 0, len = positions.length; i < len; i++) {
    const { x, y } = positions[i]

    // TODO: maybe consider doing PR that filters position to be within map bounds in createBlockPackets
    if (x < 0 || x >= getPwGameWorldHelper().width || y < 0 || y >= getPwGameWorldHelper().height) {
      continue
    }

    getPwGameWorldHelper().blocks[layer][x][y] = new Block(blockId, args)
  }
}

export function placeBlockPacket(blockPacket: SendableBlockPacket) {
  getPwGameClient().send('worldBlockPlacedPacket', blockPacket)

  // By updating block map immediately ourselves, we make a compromise here.
  // Positives:
  // - We see block placements as instant (simplifies code in many places)
  // Negatives:
  // - Not being able to see old and new block difference in worldBlockPlacedPacketReceived when blocks are placed by bot (but we don't process these anyway)
  // - If we send invalid blocks, we assume that they're valid (server should immediately close socket connection so shouldn't cause issues)
  updateBlockMap(blockPacket)
}

export function getBlockName(pwBlockId: number): PwBlockName {
  return getPwBlocksByPwId()[pwBlockId].PaletteId.toUpperCase() as PwBlockName
}

export function getBlockIdFromString(name: string): number | undefined {
  const block = getPwBlocksByPwName()[name as PwBlockName]
  if (!block) {
    return undefined
  }
  return block.Id
}

export function getBlockLayer(pwBlockId: number): LayerType {
  return getPwBlocksByPwId()[pwBlockId].Layer as LayerType
}

export function convertDeserializedStructureToWorldBlocks(
  blocks: DeserialisedStructure,
  pos: vec2 = vec2(0, 0),
): WorldBlock[] {
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

export function blockIsPortal(pwBlockName: PwBlockName | string): boolean {
  return [
    PwBlockName.PORTAL_VISIBLE_DOWN,
    PwBlockName.PORTAL_VISIBLE_LEFT,
    PwBlockName.PORTAL_VISIBLE_RIGHT,
    PwBlockName.PORTAL_VISIBLE_UP,
    PwBlockName.PORTAL_INVISIBLE_DOWN,
    PwBlockName.PORTAL_INVISIBLE_LEFT,
    PwBlockName.PORTAL_INVISIBLE_RIGHT,
    PwBlockName.PORTAL_INVISIBLE_UP,
  ].includes(pwBlockName as PwBlockName)
}

export function portalIdToNumber(portalId: string): number | undefined {
  const portalIdIsInteger = /^\d{1,5}$/.test(portalId)
  const portalIdHasNoLeadingZeros = portalId === parseInt(portalId).toString()
  return portalIdIsInteger && portalIdHasNoLeadingZeros ? parseInt(portalId) : undefined
}
