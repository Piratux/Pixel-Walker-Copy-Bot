import { ByteArray } from '@/classes/ByteArray.ts'
import { EelvlBlockId } from '@/gen/EelvlBlockId.ts'
import { getPwBlocksById, getPwGameWorldHelper, usePWClientStore } from '@/stores/PWClientStore.ts'
import { Block, DeserialisedStructure, LayerType } from 'pw-js-world'
import { EelvlBlock } from '@/types/EelvlBlock.ts'
import { downloadFile } from '@/services/FileService.ts'
import ManyKeysMap from 'many-keys-map'
import { vec2 } from '@basementuniverse/vec'
import { EelvlFileHeader } from '@/types/WorldData.ts'
import { PwBlockName } from '@/gen/PwBlockName.ts'
import { getBlockName } from '@/services/WorldService.ts'
import { EelvlLayer } from '@/enums/EelvlLayer.ts'
import { TOTAL_PW_LAYERS } from '@/constants/General.ts'
import { EelvlBlockEntry } from '@/types/EelvlBlockEntry.ts'
import { getAllWorldBlocks } from '@/services/PWClientService.ts'
import { GameError } from '@/classes/GameError.ts'
import { getEelvlBlocksById } from '@/stores/EelvlClientStore.ts'
import { hasEelvlBlockOneIntParameter, isEelvlNpc } from '@/services/EelvlUtilService.ts'

function addBlocksEntry(blocks: ManyKeysMap<EelvlBlockEntry, vec2[]>, key: EelvlBlockEntry, x: number, y: number) {
  if (!blocks.has(key)) {
    blocks.set(key, [vec2(x, y)])
  } else {
    blocks.get(key)!.push(vec2(x, y))
  }
}

export function getExportedToEelvlData(worldBlocks: DeserialisedStructure): [Buffer, string] {
  const worldMeta = getPwGameWorldHelper().meta!
  const world: EelvlFileHeader = {
    ownerName: worldMeta.owner ?? 'Unknown',
    name: worldMeta.title ?? 'Untitled world',
    width: getPwGameWorldHelper().width,
    height: getPwGameWorldHelper().height,
    gravMultiplier: 1,
    backgroundColor: 0,
    description: worldMeta.description ?? '',
    isCampaign: false,
    crewId: '',
    crewName: '',
    crewStatus: 0,
    minimapEnabled: worldMeta.minimapEnabled ?? true,
    ownerId: 'owner ID',
  }
  const bytes: ByteArray = new ByteArray(0)
  bytes.writeUTF(world.ownerName)
  bytes.writeUTF(world.name)
  bytes.writeInt(world.width)
  bytes.writeInt(world.height)
  bytes.writeFloat(world.gravMultiplier)
  bytes.writeUnsignedInt(world.backgroundColor)
  bytes.writeUTF(world.description)
  bytes.writeBoolean(world.isCampaign)
  bytes.writeUTF(world.crewId)
  bytes.writeUTF(world.crewName)
  bytes.writeInt(world.crewStatus)
  bytes.writeBoolean(world.minimapEnabled)
  bytes.writeUTF(world.ownerId)

  const blocks = new ManyKeysMap<EelvlBlockEntry, vec2[]>()
  for (let pwLayer: number = 0; pwLayer < TOTAL_PW_LAYERS; pwLayer++) {
    for (let y: number = 0; y < getPwGameWorldHelper().height; y++) {
      for (let x: number = 0; x < getPwGameWorldHelper().width; x++) {
        const pwBlock = worldBlocks.blocks[pwLayer][x][y]
        // EELVL can't have foreground block and water block (or any other overlay block) on single block
        // We give priority to foreground block over other overlay blocks
        if (
          ![LayerType.Foreground, LayerType.Background].includes(pwLayer) &&
          getBlockName(worldBlocks.blocks[LayerType.Foreground][x][y].bId) !== PwBlockName.EMPTY
        ) {
          continue
        }

        const eelvlBlock: EelvlBlock = mapBlockIdPwToEelvl(pwBlock, pwLayer)
        const eelvlBlockId: number = eelvlBlock.blockId

        if ((eelvlBlockId as EelvlBlockId) === EelvlBlockId.EMPTY) {
          continue
        }

        const eelvlLayer: EelvlLayer = getEelvlLayer(eelvlBlockId)

        const blockEntryKey: EelvlBlockEntry = getBlockEntryKey(eelvlBlockId, eelvlBlock, eelvlLayer)
        for (const key of blockEntryKey) {
          if (typeof key !== 'string' && typeof key !== 'number') {
            throw new GameError(`Unexpected type in key. x: ${x}, y: ${y} Value: ${key}, type: ${typeof key}`)
          }
        }
        addBlocksEntry(blocks, blockEntryKey, x, y)
      }
    }
  }

  for (const [keys, positions] of blocks) {
    const eelvlBlockId: number = keys[0] as number
    const eelvlLayer: number = keys[1] as number
    bytes.writeInt(eelvlBlockId)
    bytes.writeInt(eelvlLayer)
    writePositionsByteArrays(bytes, positions)
    for (let i: number = 2; i < keys.length; i++) {
      const key = keys[i]
      if (typeof key === 'string') {
        bytes.writeUTF(key)
      } else if (typeof key === 'number') {
        bytes.writeInt(key)
      } else {
        throw new GameError(`Unexpected type in key. Value: ${key}, type: ${typeof key}`)
      }
    }
  }
  bytes.compress()
  const worldId = usePWClientStore().worldId
  const fileName = `${world.name} - ${world.width}x${world.height} - ${worldId}.eelvl`

  return [bytes.buffer, fileName]
}

export function exportToEelvl() {
  const worldData = getAllWorldBlocks(getPwGameWorldHelper())
  const [byteBuffer, fileName] = getExportedToEelvlData(worldData)
  downloadFile(byteBuffer, fileName)
}

function getEelvlLayer(eelvlBlockId: number): EelvlLayer {
  return getEelvlBlocksById()[eelvlBlockId].layer
}

function getBlockEntryKey(eelvlBlockId: number, eelvlBlock: EelvlBlock, eelvlLayer: EelvlLayer): EelvlBlockEntry {
  return [eelvlBlockId, eelvlLayer, ...getBlockArgs(eelvlBlockId, eelvlBlock)]
}

function getBlockArgs(eelvlBlockId: number, eelvlBlock: EelvlBlock): EelvlBlockEntry {
  switch (eelvlBlockId as EelvlBlockId) {
    case EelvlBlockId.PORTAL:
    case EelvlBlockId.PORTAL_INVISIBLE:
      return [eelvlBlock.intParameter, eelvlBlock.portalId, eelvlBlock.portalTarget]
    case EelvlBlockId.SIGN_NORMAL:
      return [eelvlBlock.signText, eelvlBlock.signType]
    case EelvlBlockId.PORTAL_WORLD:
      return [eelvlBlock.worldPortalTargetWorldId, eelvlBlock.worldPortalTargetSpawnPointId]
    case EelvlBlockId.LABEL:
      return [eelvlBlock.labelText, eelvlBlock.labelTextColor, eelvlBlock.labelWrapLength]
    default:
      if (hasEelvlBlockOneIntParameter(eelvlBlockId)) {
        return [eelvlBlock.intParameter]
      } else if (isEelvlNpc(eelvlBlockId)) {
        return [eelvlBlock.npcName, eelvlBlock.npcMessage1, eelvlBlock.npcMessage2, eelvlBlock.npcMessage3]
      } else {
        return []
      }
  }
}

function writePositionsByteArrays(bytes: ByteArray, positions: vec2[]) {
  const positionsX: ByteArray = new ByteArray(0)
  const positionsY: ByteArray = new ByteArray(0)

  for (const pos of positions) {
    positionsX.writeUnsignedShort(pos.x)
    positionsY.writeUnsignedShort(pos.y)
  }

  bytes.writeUnsignedInt(positionsX.length)
  bytes.writeBytes(positionsX)
  bytes.writeUnsignedInt(positionsY.length)
  bytes.writeBytes(positionsY)
}

function mapBlockIdPwToEelvl(pwBlock: Block, pwLayer: LayerType): EelvlBlock {
  const pwBlockName = getBlockName(pwBlock.bId)

  switch (pwBlockName) {
    case PwBlockName.COIN_GOLD_DOOR:
      return { blockId: EelvlBlockId.COIN_GOLD_DOOR, intParameter: pwBlock.args[0] as number }
    case PwBlockName.COIN_GOLD_GATE:
      return { blockId: EelvlBlockId.COIN_GOLD_GATE, intParameter: pwBlock.args[0] as number }
    case PwBlockName.COIN_BLUE_DOOR:
      return { blockId: EelvlBlockId.COIN_BLUE_DOOR, intParameter: pwBlock.args[0] as number }
    case PwBlockName.COIN_BLUE_GATE:
      return { blockId: EelvlBlockId.COIN_BLUE_GATE, intParameter: pwBlock.args[0] as number }
    case PwBlockName.EFFECTS_JUMP_HEIGHT:
      return getPwToEelvlEffectsJumpHeightBlock(pwBlock)
    case PwBlockName.EFFECTS_FLY:
      return { blockId: EelvlBlockId.EFFECTS_FLY, intParameter: pwBlock.args[0] === true ? 1 : 0 }
    case PwBlockName.EFFECTS_SPEED:
      return getPwToEelvlEffectsSpeedBlock(pwBlock)
    case PwBlockName.EFFECTS_INVULNERABILITY:
      return { blockId: EelvlBlockId.EFFECTS_INVULNERABILITY, intParameter: pwBlock.args[0] === true ? 1 : 0 }
    case PwBlockName.EFFECTS_CURSE:
      return { blockId: EelvlBlockId.EFFECTS_CURSE, intParameter: pwBlock.args[0] as number }
    case PwBlockName.EFFECTS_ZOMBIE:
      return { blockId: EelvlBlockId.EFFECTS_ZOMBIE, intParameter: pwBlock.args[0] as number }
    case PwBlockName.EFFECTS_GRAVITYFORCE:
      return getPwToEelvlEffectsGravityForceBlock(pwBlock)
    case PwBlockName.EFFECTS_MULTI_JUMP:
      return getPwToEelvlEffectsMultiJumpBlock(pwBlock)
    case PwBlockName.TOOL_PORTAL_WORLD_SPAWN:
      return { blockId: EelvlBlockId.TOOL_PORTAL_WORLD_SPAWN, intParameter: 1 }
    case PwBlockName.SIGN_NORMAL:
      return { blockId: EelvlBlockId.SIGN_NORMAL, signType: 0, signText: pwBlock.args[0] as string }
    case PwBlockName.SIGN_RED:
      return { blockId: EelvlBlockId.SIGN_NORMAL, signType: 2, signText: pwBlock.args[0] as string }
    case PwBlockName.SIGN_GREEN:
      return createMissingBlockSign(`${PwBlockName.SIGN_GREEN} text: '${pwBlock.args[0] as string}'`)
    case PwBlockName.SIGN_BLUE:
      return { blockId: EelvlBlockId.SIGN_NORMAL, signType: 1, signText: pwBlock.args[0] as string }
    case PwBlockName.SIGN_GOLD:
      return { blockId: EelvlBlockId.SIGN_NORMAL, signType: 3, signText: pwBlock.args[0] as string }
    case PwBlockName.PORTAL:
      return getPwToEelvlPortalBlock(pwBlock, EelvlBlockId.PORTAL)
    case PwBlockName.PORTAL_INVISIBLE:
      return getPwToEelvlPortalBlock(pwBlock, EelvlBlockId.PORTAL_INVISIBLE)
    case PwBlockName.PORTAL_WORLD:
      return {
        blockId: EelvlBlockId.PORTAL_WORLD,
        worldPortalTargetWorldId: 'Current',
        worldPortalTargetSpawnPointId: 1,
      }
    case PwBlockName.SWITCH_LOCAL_TOGGLE:
      return { blockId: EelvlBlockId.SWITCH_LOCAL_TOGGLE, intParameter: pwBlock.args[0] as number }
    case PwBlockName.SWITCH_LOCAL_ACTIVATOR:
      return getPwToEelvlSwitchActivatorBlock(pwBlock, EelvlBlockId.SWITCH_LOCAL_ACTIVATOR)
    case PwBlockName.SWITCH_LOCAL_RESETTER:
      return createMissingBlockSign(
        `${PwBlockName.SWITCH_LOCAL_RESETTER} switch state: ${pwBlock.args[0] === 1 ? 'ON' : 'OFF'}`,
      )
    case PwBlockName.SWITCH_LOCAL_DOOR:
      return { blockId: EelvlBlockId.SWITCH_LOCAL_DOOR, intParameter: pwBlock.args[0] as number }
    case PwBlockName.SWITCH_LOCAL_GATE:
      return { blockId: EelvlBlockId.SWITCH_LOCAL_GATE, intParameter: pwBlock.args[0] as number }
    case PwBlockName.SWITCH_GLOBAL_TOGGLE:
      return { blockId: EelvlBlockId.SWITCH_GLOBAL_TOGGLE, intParameter: pwBlock.args[0] as number }
    case PwBlockName.SWITCH_GLOBAL_ACTIVATOR:
      return getPwToEelvlSwitchActivatorBlock(pwBlock, EelvlBlockId.SWITCH_GLOBAL_ACTIVATOR)
    case PwBlockName.SWITCH_GLOBAL_RESETTER:
      return createMissingBlockSign(
        `${PwBlockName.SWITCH_GLOBAL_RESETTER} switch state: ${pwBlock.args[0] === 1 ? 'ON' : 'OFF'}`,
      )
    case PwBlockName.SWITCH_GLOBAL_DOOR:
      return { blockId: EelvlBlockId.SWITCH_GLOBAL_DOOR, intParameter: pwBlock.args[0] as number }
    case PwBlockName.SWITCH_GLOBAL_GATE:
      return { blockId: EelvlBlockId.SWITCH_GLOBAL_GATE, intParameter: pwBlock.args[0] as number }
    case PwBlockName.HAZARD_DEATH_DOOR:
      return { blockId: EelvlBlockId.HAZARD_DEATH_DOOR, intParameter: pwBlock.args[0] as number }
    case PwBlockName.HAZARD_DEATH_GATE:
      return { blockId: EelvlBlockId.HAZARD_DEATH_GATE, intParameter: pwBlock.args[0] as number }
    case PwBlockName.NOTE_DRUM:
      return getPwToEelvlNoteBlock(pwBlock, PwBlockName.NOTE_DRUM, EelvlBlockId.NOTE_DRUM)
    case PwBlockName.NOTE_PIANO:
      return getPwToEelvlNoteBlock(pwBlock, PwBlockName.NOTE_PIANO, EelvlBlockId.NOTE_PIANO)
    case PwBlockName.NOTE_GUITAR:
      return getPwToEelvlNoteBlock(pwBlock, PwBlockName.NOTE_GUITAR, EelvlBlockId.NOTE_GUITAR)
    // TODO: Awaiting fix
    case PwBlockName.DOMESTIC_TELEVISION_GRAY:
      return { blockId: EelvlBlockId.DOMESTIC_TELEVISION_BLACK, intParameter: 2 }
    // TODO: Awaiting fix
    case PwBlockName.DOMESTIC_TELEVISION_BLUE:
      return { blockId: EelvlBlockId.DOMESTIC_TELEVISION_BLACK, intParameter: 3 }
    // TODO: Awaiting fix
    case PwBlockName.CHRISTMAS_GIFT_HALF_RED:
      return { blockId: EelvlBlockId.CHRISTMAS_GIFT_HALF_RED, intParameter: 1 }
    // TODO: Awaiting fix
    case PwBlockName.CHRISTMAS_GIFT_HALF_GREEN:
      return { blockId: EelvlBlockId.CHRISTMAS_GIFT_HALF_GREEN, intParameter: 1 }
    // TODO: Awaiting fix
    case PwBlockName.CHRISTMAS_GIFT_HALF_WHITE:
      return { blockId: EelvlBlockId.CHRISTMAS_GIFT_HALF_WHITE, intParameter: 1 }
    // TODO: Awaiting fix
    case PwBlockName.CHRISTMAS_GIFT_HALF_BLUE:
      return { blockId: EelvlBlockId.CHRISTMAS_GIFT_HALF_BLUE, intParameter: 1 }
    // TODO: Awaiting fix
    case PwBlockName.CHRISTMAS_GIFT_HALF_YELLOW:
      return { blockId: EelvlBlockId.CHRISTMAS_GIFT_HALF_YELLOW, intParameter: 1 }
    // TODO: Awaiting fix
    case PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_YELLOW:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_BOTTOM_RED, intParameter: 2 }
    // TODO: Awaiting fix
    case PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_GREEN:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_BOTTOM_RED, intParameter: 3 }
    default: {
      const mappedPwBlock = getPwBlocksById()[pwBlock.bId]

      if (pwBlockName === undefined || mappedPwBlock === undefined) {
        if (pwLayer === LayerType.Foreground) {
          return createMissingBlockSign(`Unknown Block ID: ${pwBlock.bId}`)
        } else {
          return { blockId: EelvlBlockId.EMPTY }
        }
      }

      if (mappedPwBlock.LegacyId !== undefined) {
        if (mappedPwBlock.LegacyMorph !== undefined) {
          return { blockId: mappedPwBlock.LegacyId, intParameter: mappedPwBlock.LegacyMorph[0] }
        } else {
          return { blockId: mappedPwBlock.LegacyId }
        }
      }

      if (pwLayer !== LayerType.Background) {
        return createMissingBlockSign(`Missing EELVL block: ${pwBlockName}`)
      } else {
        return { blockId: EelvlBlockId.EMPTY }
      }
    }
  }
}

function createMissingBlockSign(message: string): EelvlBlock {
  return { blockId: EelvlBlockId.SIGN_NORMAL, signType: 0, signText: message }
}

function getPwToEelvlEffectsJumpHeightBlock(pwBlock: Block): EelvlBlock {
  const jumpHeight = pwBlock.args[0] as number
  switch (jumpHeight) {
    case 2:
      return { blockId: EelvlBlockId.EFFECTS_JUMP_HEIGHT, intParameter: 2 }
    case 3:
      return { blockId: EelvlBlockId.EFFECTS_JUMP_HEIGHT, intParameter: 0 }
    case 6:
      return { blockId: EelvlBlockId.EFFECTS_JUMP_HEIGHT, intParameter: 1 }
    default:
      return createMissingBlockSign(`${PwBlockName.EFFECTS_JUMP_HEIGHT} jump height (blocks): ${jumpHeight}`)
  }
}

function getPwToEelvlEffectsSpeedBlock(pwBlock: Block): EelvlBlock {
  const speed = pwBlock.args[0] as number
  switch (speed) {
    case 60:
      return { blockId: EelvlBlockId.EFFECTS_SPEED, intParameter: 2 }
    case 100:
      return { blockId: EelvlBlockId.EFFECTS_SPEED, intParameter: 0 }
    case 150:
      return { blockId: EelvlBlockId.EFFECTS_SPEED, intParameter: 1 }
    default:
      return createMissingBlockSign(`${PwBlockName.EFFECTS_SPEED} speed (%): ${speed}`)
  }
}

function getPwToEelvlEffectsGravityForceBlock(pwBlock: Block): EelvlBlock {
  const gravityForce = pwBlock.args[0] as number
  switch (gravityForce) {
    case 15:
      return { blockId: EelvlBlockId.EFFECTS_GRAVITYFORCE, intParameter: 1 }
    case 100:
      return { blockId: EelvlBlockId.EFFECTS_GRAVITYFORCE, intParameter: 0 }
    default:
      return createMissingBlockSign(`${PwBlockName.EFFECTS_GRAVITYFORCE} gravity (%): ${gravityForce}`)
  }
}

function getPwToEelvlEffectsMultiJumpBlock(pwBlock: Block): EelvlBlock {
  let jumpCount = pwBlock.args[0] as number
  if (jumpCount < 0 || jumpCount > 999) {
    jumpCount = 1000 // EELVL uses 1000 as infinite jumps
  }
  return { blockId: EelvlBlockId.EFFECTS_MULTI_JUMP, intParameter: jumpCount }
}

function getPwToEelvlPortalBlock(pwBlock: Block, eelvlBlockId: EelvlBlockId): EelvlBlock {
  let rotation = pwBlock.args[0]
  const portalId = pwBlock.args[1]
  const portalTarget = pwBlock.args[2]
  switch (rotation) {
    case 0:
      rotation = 1
      break
    case 1:
      rotation = 2
      break
    case 2:
      rotation = 3
      break
    case 3:
      rotation = 0
      break
  }
  return {
    blockId: eelvlBlockId,
    intParameter: rotation as number,
    portalId: portalId as number,
    portalTarget: portalTarget as number,
  }
}

function getPwToEelvlNoteBlock(pwBlock: Block, pwBlockName: PwBlockName, eelvlBlockId: EelvlBlockId): EelvlBlock {
  const notes = pwBlock.args[0] as Uint8Array
  if (notes.length === 1) {
    let intParameter = notes.at(0)!
    if (eelvlBlockId === EelvlBlockId.NOTE_PIANO) {
      intParameter -= 27
    }
    return { blockId: eelvlBlockId, intParameter: intParameter }
  } else {
    return createMissingBlockSign(`${pwBlockName} notes: ${Array.from(notes).toString()}`)
  }
}

function getPwToEelvlSwitchActivatorBlock(pwBlock: Block, eelvlBlockId: EelvlBlockId): EelvlBlock {
  const switchIdArg = pwBlock.args[0] as number
  const switchStateArg = pwBlock.args[1] as number // 0 = OFF, 1 = ON
  if (switchStateArg === 0) {
    return { blockId: eelvlBlockId, intParameter: switchIdArg }
  } else {
    const pwBlockName =
      eelvlBlockId === EelvlBlockId.SWITCH_LOCAL_ACTIVATOR
        ? PwBlockName.SWITCH_LOCAL_ACTIVATOR
        : PwBlockName.SWITCH_GLOBAL_ACTIVATOR
    return createMissingBlockSign(`${pwBlockName} switch id: ${switchIdArg}, switch state: ON`)
  }
}
