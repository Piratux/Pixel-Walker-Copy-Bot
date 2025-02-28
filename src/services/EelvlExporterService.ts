import { ByteArray } from '@/classes/ByteArray.ts'
import { EelvlBlockId, hasEelvlBlockOneIntParameter, hasEelvlBlockOneUIntParameter, hasEelvlBlockTwoIntParameters, isEelvlNpc } from '@/enums/EelvlBlockId.ts'
import { getPwGameWorldHelper, usePWClientStore } from '@/stores/PWClientStore.ts'
import { Block, LayerType } from 'pw-js-world'
import { EelvlBlock } from '@/types/EelvlBlock.ts'
import { downloadFile } from '@/services/FileService.ts'
import ManyKeysMap from 'many-keys-map'
import { vec2 } from '@basementuniverse/vec'
import { EelvlFileHeader } from '@/types/WorldData.ts'
import { PwBlockName } from '@/enums/PwBlockName.ts'
import { getBlockName } from '@/services/WorldService.ts'
import { EelvlLayer } from '@/enums/EelvlLayer.ts'

function addBlocksEntry(blocks: ManyKeysMap<any[], vec2[]>, key: any[], x: number, y: number) {
  if (!blocks.has(key)) {
    blocks.set(key, [vec2(x, y)])
  } else {
    blocks.get(key)!.push(vec2(x, y))
  }
}

export function exportToEelvl() {
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

  let blocks = new ManyKeysMap()
  for (let z: number = 0; z < 2; z++) {
    for (let y: number = 0; y < getPwGameWorldHelper().height; y++) {
      for (let x: number = 0; x < getPwGameWorldHelper().width; x++) {
        const pwBlock = getPwGameWorldHelper().getBlockAt(x, y, z)
        const eelvlLayer = mapLayerPwToEelvl(z)
        const eelvlBlock = mapBlockIdPwToEelvl(pwBlock, eelvlLayer)
        const eelvlBlockId: number = eelvlBlock.blockId

        if (eelvlBlockId === EelvlBlockId.EMPTY) {
          continue
        }

        const blockEntryKey = getBlockEntryKey(eelvlBlockId, eelvlBlock, eelvlLayer)
        for (const key of blockEntryKey) {
          if (typeof key !== 'string' && typeof key !== 'number') {
            console.error(`Unexpected type in key. x: ${x}, y: ${y} Value: ${key}, type: ${typeof key}`)
          }
        }
        addBlocksEntry(blocks, blockEntryKey, x, y)
      }
    }
  }

  for (const [keys, positions] of blocks) {
    const eelvlBlockId: number = keys[0]
    const eelvlLayer: number = keys[1]
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
        console.error(`Unexpected type in key. Value: ${key}, type: ${typeof key}`)
      }
    }
  }
  bytes.compress()
  const worldId = usePWClientStore().worldId
  const fileName = `${world.name} - ${world.width}x${world.height} - ${worldId}.eelvl`
  downloadFile(bytes.buffer, fileName)
}

function mapLayerPwToEelvl(pwLayer: number) {
  switch (pwLayer) {
    case LayerType.Background:
      return EelvlLayer.BACKGROUND
    case LayerType.Foreground:
      return EelvlLayer.FOREGROUND
    default:
      throw Error(`Unknown layer type: ${pwLayer}`)
  }
}

function getBlockEntryKey(eelvlBlockId: number, eelvlBlock: EelvlBlock, eelvlLayer: number) {
  return [eelvlBlockId, eelvlLayer, ...getBlockArgs(eelvlBlockId, eelvlBlock, eelvlLayer)]
}

function getBlockArgs(eelvlBlockId: number, eelvlBlock: EelvlBlock, eelvlLayer: number) {
  switch (eelvlBlockId) {
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
      if (hasEelvlBlockOneIntParameter(eelvlBlockId, eelvlLayer)) {
        return [eelvlBlock.intParameter]
      } else if (hasEelvlBlockTwoIntParameters(eelvlBlockId, eelvlLayer)) {
          return [eelvlBlock.intParameter, eelvlBlock.intParameterTwo]
      } else if (hasEelvlBlockOneUIntParameter(eelvlBlockId)) {
        return [eelvlBlock.uintParameter]
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

function mapBlockIdPwToEelvl(pwBlock: Block, eelvlLayer: EelvlLayer): EelvlBlock {
  const pwBlockName: string = getBlockName(pwBlock.bId)

  switch (pwBlockName) {
    case PwBlockName.CLIMBABLE_CHAIN_LIGHT_HORIZONTAL:
      return { blockId: EelvlBlockId.CLIMBABLE_CHAIN_LIGHT_VERTICAL }
    case PwBlockName.CLIMBABLE_CHAIN_DARK_HORIZONTAL:
      return { blockId: EelvlBlockId.CLIMBABLE_CHAIN_DARK_VERTICAL }
    case PwBlockName.CLIMBABLE_ROPE_HORIZONTAL:
      return { blockId: EelvlBlockId.CLIMBABLE_ROPE_VERTICAL }
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
    case PwBlockName.EFFECTS_GRAVITY_LEFT:
      return { blockId: EelvlBlockId.EFFECTS_GRAVITY_DOWN, intParameter: 1 }
    case PwBlockName.EFFECTS_GRAVITY_UP:
      return { blockId: EelvlBlockId.EFFECTS_GRAVITY_DOWN, intParameter: 2 }
    case PwBlockName.EFFECTS_GRAVITY_RIGHT:
      return { blockId: EelvlBlockId.EFFECTS_GRAVITY_DOWN, intParameter: 3 }
    case PwBlockName.EFFECTS_GRAVITY_DOWN:
      return { blockId: EelvlBlockId.EFFECTS_GRAVITY_DOWN, intParameter: 0 }
    case PwBlockName.EFFECTS_GRAVITY_OFF:
      return { blockId: EelvlBlockId.EFFECTS_GRAVITY_DOWN, intParameter: 4 }
    case PwBlockName.TOOL_PORTAL_WORLD_SPAWN:
      return { blockId: EelvlBlockId.TOOL_PORTAL_WORLD_SPAWN, intParameter: 1 }
    case PwBlockName.SIGN_NORMAL:
      return { blockId: EelvlBlockId.SIGN_NORMAL, signType: 0, signText: pwBlock.args[0] as string }
    case PwBlockName.SIGN_RED:
      return { blockId: EelvlBlockId.SIGN_NORMAL, signType: 2, signText: pwBlock.args[0] as string }
    case PwBlockName.SIGN_GREEN:
      return { blockId: EelvlBlockId.SIGN_NORMAL, signType: 0, signText: pwBlock.args[0] as string }
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
    case PwBlockName.HAZARD_SPIKES_BROWN_UP:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 1 }
    case PwBlockName.HAZARD_SPIKES_BROWN_RIGHT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 2 }
    case PwBlockName.HAZARD_SPIKES_BROWN_DOWN:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 3 }
    case PwBlockName.HAZARD_SPIKES_BROWN_LEFT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 0 }
    case PwBlockName.HAZARD_SPIKES_WHITE_UP:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_WHITE_UP, intParameter: 1 }
    case PwBlockName.HAZARD_SPIKES_WHITE_RIGHT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_WHITE_UP, intParameter: 2 }
    case PwBlockName.HAZARD_SPIKES_WHITE_DOWN:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_WHITE_UP, intParameter: 3 }
    case PwBlockName.HAZARD_SPIKES_WHITE_LEFT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_WHITE_UP, intParameter: 0 }
    case PwBlockName.HAZARD_SPIKES_GRAY_UP:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_GRAY_UP, intParameter: 1 }
    case PwBlockName.HAZARD_SPIKES_GRAY_RIGHT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_GRAY_UP, intParameter: 2 }
    case PwBlockName.HAZARD_SPIKES_GRAY_DOWN:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_GRAY_UP, intParameter: 3 }
    case PwBlockName.HAZARD_SPIKES_GRAY_LEFT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_GRAY_UP, intParameter: 0 }
    case PwBlockName.HAZARD_SPIKES_RED_UP:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_RED_UP, intParameter: 1 }
    case PwBlockName.HAZARD_SPIKES_RED_RIGHT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_RED_UP, intParameter: 2 }
    case PwBlockName.HAZARD_SPIKES_RED_DOWN:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_RED_UP, intParameter: 3 }
    case PwBlockName.HAZARD_SPIKES_RED_LEFT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_RED_UP, intParameter: 0 }
    case PwBlockName.HAZARD_SPIKES_YELLOW_UP:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_YELLOW_UP, intParameter: 1 }
    case PwBlockName.HAZARD_SPIKES_YELLOW_RIGHT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_YELLOW_UP, intParameter: 2 }
    case PwBlockName.HAZARD_SPIKES_YELLOW_DOWN:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_YELLOW_UP, intParameter: 3 }
    case PwBlockName.HAZARD_SPIKES_YELLOW_LEFT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_YELLOW_UP, intParameter: 0 }
    case PwBlockName.HAZARD_SPIKES_GREEN_UP:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_GREEN_UP, intParameter: 1 }
    case PwBlockName.HAZARD_SPIKES_GREEN_RIGHT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_GREEN_UP, intParameter: 2 }
    case PwBlockName.HAZARD_SPIKES_GREEN_DOWN:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_GREEN_UP, intParameter: 3 }
    case PwBlockName.HAZARD_SPIKES_GREEN_LEFT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_GREEN_UP, intParameter: 0 }
    case PwBlockName.HAZARD_SPIKES_BLUE_UP:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BLUE_UP, intParameter: 1 }
    case PwBlockName.HAZARD_SPIKES_BLUE_RIGHT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BLUE_UP, intParameter: 2 }
    case PwBlockName.HAZARD_SPIKES_BLUE_DOWN:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BLUE_UP, intParameter: 3 }
    case PwBlockName.HAZARD_SPIKES_BLUE_LEFT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BLUE_UP, intParameter: 0 }
    case PwBlockName.HAZARD_SPIKES_CYAN_UP:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 1 }
    case PwBlockName.HAZARD_SPIKES_CYAN_RIGHT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 2 }
    case PwBlockName.HAZARD_SPIKES_CYAN_DOWN:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 3 }
    case PwBlockName.HAZARD_SPIKES_CYAN_LEFT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 0 }
    case PwBlockName.HAZARD_SPIKES_CYAN_CENTER:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_CENTER }
    case PwBlockName.HAZARD_SPIKES_PURPLE_UP:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 1 }
    case PwBlockName.HAZARD_SPIKES_PURPLE_RIGHT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 2 }
    case PwBlockName.HAZARD_SPIKES_PURPLE_DOWN:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 3 }
    case PwBlockName.HAZARD_SPIKES_PURPLE_LEFT:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_UP, intParameter: 0 }
    case PwBlockName.HAZARD_SPIKES_PURPLE_CENTER:
      return { blockId: EelvlBlockId.HAZARD_SPIKES_BROWN_CENTER }
    case PwBlockName.HAZARD_DEATH_DOOR:
      return { blockId: EelvlBlockId.HAZARD_DEATH_DOOR, intParameter: pwBlock.args[0] as number }
    case PwBlockName.HAZARD_DEATH_GATE:
      return { blockId: EelvlBlockId.HAZARD_DEATH_GATE, intParameter: pwBlock.args[0] as number }
    case PwBlockName.NOTE_DRUM:
      return getPwToEelvlNoteBlock(pwBlock, EelvlBlockId.NOTE_DRUM)
    case PwBlockName.NOTE_PIANO:
      return getPwToEelvlNoteBlock(pwBlock, EelvlBlockId.NOTE_PIANO)
    case PwBlockName.NOTE_GUITAR:
      return getPwToEelvlNoteBlock(pwBlock, EelvlBlockId.NOTE_GUITAR)
    case PwBlockName.TEAM_EFFECT_NONE:
      return { blockId: EelvlBlockId.TEAM_EFFECT_NONE, intParameter: 0 }
    case PwBlockName.TEAM_EFFECT_RED:
      return { blockId: EelvlBlockId.TEAM_EFFECT_NONE, intParameter: 1 }
    case PwBlockName.TEAM_EFFECT_GREEN:
      return { blockId: EelvlBlockId.TEAM_EFFECT_NONE, intParameter: 2 }
    case PwBlockName.TEAM_EFFECT_BLUE:
      return { blockId: EelvlBlockId.TEAM_EFFECT_NONE, intParameter: 3 }
    case PwBlockName.TEAM_EFFECT_CYAN:
      return { blockId: EelvlBlockId.TEAM_EFFECT_NONE, intParameter: 4 }
    case PwBlockName.TEAM_EFFECT_MAGENTA:
      return { blockId: EelvlBlockId.TEAM_EFFECT_NONE, intParameter: 5 }
    case PwBlockName.TEAM_EFFECT_YELLOW:
      return { blockId: EelvlBlockId.TEAM_EFFECT_NONE, intParameter: 6 }
    case PwBlockName.TEAM_NONE_DOOR:
      return { blockId: EelvlBlockId.TEAM_NONE_DOOR, intParameter: 0 }
    case PwBlockName.TEAM_RED_DOOR:
      return { blockId: EelvlBlockId.TEAM_NONE_DOOR, intParameter: 1 }
    case PwBlockName.TEAM_GREEN_DOOR:
      return { blockId: EelvlBlockId.TEAM_NONE_DOOR, intParameter: 2 }
    case PwBlockName.TEAM_BLUE_DOOR:
      return { blockId: EelvlBlockId.TEAM_NONE_DOOR, intParameter: 3 }
    case PwBlockName.TEAM_CYAN_DOOR:
      return { blockId: EelvlBlockId.TEAM_NONE_DOOR, intParameter: 4 }
    case PwBlockName.TEAM_MAGENTA_DOOR:
      return { blockId: EelvlBlockId.TEAM_NONE_DOOR, intParameter: 5 }
    case PwBlockName.TEAM_YELLOW_DOOR:
      return { blockId: EelvlBlockId.TEAM_NONE_DOOR, intParameter: 6 }
    case PwBlockName.TEAM_NONE_GATE:
      return { blockId: EelvlBlockId.TEAM_NONE_GATE, intParameter: 0 }
    case PwBlockName.TEAM_RED_GATE:
      return { blockId: EelvlBlockId.TEAM_NONE_GATE, intParameter: 1 }
    case PwBlockName.TEAM_GREEN_GATE:
      return { blockId: EelvlBlockId.TEAM_NONE_GATE, intParameter: 2 }
    case PwBlockName.TEAM_BLUE_GATE:
      return { blockId: EelvlBlockId.TEAM_NONE_GATE, intParameter: 3 }
    case PwBlockName.TEAM_CYAN_GATE:
      return { blockId: EelvlBlockId.TEAM_NONE_GATE, intParameter: 4 }
    case PwBlockName.TEAM_MAGENTA_GATE:
      return { blockId: EelvlBlockId.TEAM_NONE_GATE, intParameter: 5 }
    case PwBlockName.TEAM_YELLOW_GATE:
      return { blockId: EelvlBlockId.TEAM_NONE_GATE, intParameter: 6 }
    case PwBlockName.GENERIC_YELLOW_FACE_SMILE:
      return { blockId: EelvlBlockId.GENERIC_YELLOW_FACE }
    case PwBlockName.GENERIC_YELLOW_FACE_FROWN:
      return { blockId: EelvlBlockId.GENERIC_YELLOW_FACE }
    case PwBlockName.MINERALS_PURPLE:
      return { blockId: EelvlBlockId.MINERALS_MAGENTA }
    case PwBlockName.BEACH_SAND_DRIFT_TOP_LEFT:
      return { blockId: EelvlBlockId.BEACH_SAND_DRIFT_BOTTOM_LEFT }
    case PwBlockName.BEACH_SAND_DRIFT_TOP_RIGHT:
      return { blockId: EelvlBlockId.BEACH_SAND_DRIFT_BOTTOM_RIGHT }
    case PwBlockName.HALLOWEEN_COBWEB_BOTTOM_LEFT:
      return { blockId: EelvlBlockId.HALLOWEEN_COBWEB_TOP_LEFT }
    case PwBlockName.HALLOWEEN_COBWEB_BOTTOM_RIGHT:
      return { blockId: EelvlBlockId.HALLOWEEN_COBWEB_TOP_RIGHT }
    case PwBlockName.HALLOWEEN_TREE_BRANCH_TOP_LEFT:
      return { blockId: EelvlBlockId.HALLOWEEN_TREE_BRANCH_BOTTOM_RIGHT, intParameter: 3 }
    case PwBlockName.HALLOWEEN_TREE_BRANCH_TOP_RIGHT:
      return { blockId: EelvlBlockId.HALLOWEEN_TREE_BRANCH_BOTTOM_RIGHT, intParameter: 0 }
    case PwBlockName.HALLOWEEN_TREE_BRANCH_BOTTOM_LEFT:
      return { blockId: EelvlBlockId.HALLOWEEN_TREE_BRANCH_BOTTOM_RIGHT, intParameter: 2 }
    case PwBlockName.HALLOWEEN_TREE_BRANCH_BOTTOM_RIGHT:
      return { blockId: EelvlBlockId.HALLOWEEN_TREE_BRANCH_BOTTOM_RIGHT, intParameter: 1 }
    case PwBlockName.HALLOWEEN_PUMPKIN_ON:
      return { blockId: EelvlBlockId.HALLOWEEN_PUMPKIN_OFF, intParameter: 0 }
    case PwBlockName.HALLOWEEN_PUMPKIN_OFF:
      return { blockId: EelvlBlockId.HALLOWEEN_PUMPKIN_OFF, intParameter: 1 }
    case PwBlockName.HALLOWEEN_EYES_YELLOW:
      return { blockId: EelvlBlockId.HALLOWEEN_EYES_ORANGE, intParameter: 0 }
    case PwBlockName.HALLOWEEN_EYES_ORANGE:
      return { blockId: EelvlBlockId.HALLOWEEN_EYES_ORANGE, intParameter: 1 }
    case PwBlockName.HALLOWEEN_EYES_PURPLE:
      return { blockId: EelvlBlockId.HALLOWEEN_EYES_ORANGE, intParameter: 2 }
    case PwBlockName.HALLOWEEN_EYES_GREEN:
      return { blockId: EelvlBlockId.HALLOWEEN_EYES_ORANGE, intParameter: 3 }
    case PwBlockName.INDUSTRIAL_PISTON_LEFT:
      return { blockId: EelvlBlockId.INDUSTRIAL_PISTON_BOTTOM, intParameter: 2 }
    case PwBlockName.INDUSTRIAL_PISTON_RIGHT:
      return { blockId: EelvlBlockId.INDUSTRIAL_PISTON_BOTTOM, intParameter: 0 }
    case PwBlockName.INDUSTRIAL_PISTON_BOTTOM:
      return { blockId: EelvlBlockId.INDUSTRIAL_PISTON_BOTTOM, intParameter: 1 }
    case PwBlockName.INDUSTRIAL_PIPE_THIN_HORIZONTAL:
      return { blockId: EelvlBlockId.INDUSTRIAL_PIPE_THIN_HORIZONTAL, intParameter: 1 }
    case PwBlockName.INDUSTRIAL_PIPE_THIN_VERTICAL:
      return { blockId: EelvlBlockId.INDUSTRIAL_PIPE_THIN_HORIZONTAL, intParameter: 0 }
    case PwBlockName.INDUSTRIAL_PIPE_DECORATION_HORIZONTAL:
      return { blockId: EelvlBlockId.INDUSTRIAL_PIPE_DECORATION_HORIZONTAL, intParameter: 1 }
    case PwBlockName.INDUSTRIAL_PIPE_DECORATION_VERTICAL:
      return { blockId: EelvlBlockId.INDUSTRIAL_PIPE_DECORATION_HORIZONTAL, intParameter: 0 }
    case PwBlockName.MEDIEVAL_SCAFFOLDING_STRAIGHT_T:
      return { blockId: EelvlBlockId.MEDIEVAL_SCAFFOLDING_STRAIGHT_HORIZONTAL, intParameter: 2 }
    case PwBlockName.MEDIEVAL_SCAFFOLDING_STRAIGHT_HORIZONTAL:
      return { blockId: EelvlBlockId.MEDIEVAL_SCAFFOLDING_STRAIGHT_HORIZONTAL, intParameter: 1 }
    case PwBlockName.MEDIEVAL_SCAFFOLDING_ANGLED_MIDDLE:
      return { blockId: EelvlBlockId.MEDIEVAL_SCAFFOLDING_STRAIGHT_HORIZONTAL, intParameter: 0 }
    case PwBlockName.MEDIEVAL_SCAFFOLDING_STRAIGHT_VERTICAL:
      return { blockId: EelvlBlockId.MEDIEVAL_SCAFFOLDING_STRAIGHT_HORIZONTAL, intParameter: 3 }
    case PwBlockName.MEDIEVAL_SCAFFOLDING_ANGLED_RIGHT:
      return { blockId: EelvlBlockId.MEDIEVAL_SCAFFOLDING_STRAIGHT_HORIZONTAL, intParameter: 4 }
    case PwBlockName.MEDIEVAL_SCAFFOLDING_ANGLED_LEFT:
      return { blockId: EelvlBlockId.MEDIEVAL_SCAFFOLDING_STRAIGHT_HORIZONTAL, intParameter: 5 }
    case PwBlockName.MEDIEVAL_AXE_TOP_LEFT:
      return { blockId: EelvlBlockId.MEDIEVAL_AXE_TOP_RIGHT, intParameter: 0 }
    case PwBlockName.MEDIEVAL_AXE_TOP_RIGHT:
      return { blockId: EelvlBlockId.MEDIEVAL_AXE_TOP_RIGHT, intParameter: 1 }
    case PwBlockName.MEDIEVAL_AXE_BOTTOM_LEFT:
      return { blockId: EelvlBlockId.MEDIEVAL_AXE_TOP_RIGHT, intParameter: 3 }
    case PwBlockName.MEDIEVAL_AXE_BOTTOM_RIGHT:
      return { blockId: EelvlBlockId.MEDIEVAL_AXE_TOP_RIGHT, intParameter: 2 }
    case PwBlockName.MEDIEVAL_SWORD_TOP_LEFT:
      return { blockId: EelvlBlockId.MEDIEVAL_SWORD_BOTTOM_RIGHT, intParameter: 3 }
    case PwBlockName.MEDIEVAL_SWORD_TOP_RIGHT:
      return { blockId: EelvlBlockId.MEDIEVAL_SWORD_BOTTOM_RIGHT, intParameter: 0 }
    case PwBlockName.MEDIEVAL_SWORD_BOTTOM_LEFT:
      return { blockId: EelvlBlockId.MEDIEVAL_SWORD_BOTTOM_RIGHT, intParameter: 2 }
    case PwBlockName.MEDIEVAL_SWORD_BOTTOM_RIGHT:
      return { blockId: EelvlBlockId.MEDIEVAL_SWORD_BOTTOM_RIGHT, intParameter: 1 }
    case PwBlockName.MEDIEVAL_SHIELD_CIRCLE_BLUE:
      return { blockId: EelvlBlockId.MEDIEVAL_SHIELD_CIRCLE_BLUE, intParameter: 1 }
    case PwBlockName.MEDIEVAL_SHIELD_CIRCLE_GREEN:
      return { blockId: EelvlBlockId.MEDIEVAL_SHIELD_CIRCLE_BLUE, intParameter: 2 }
    case PwBlockName.MEDIEVAL_SHIELD_CIRCLE_YELLOW:
      return { blockId: EelvlBlockId.MEDIEVAL_SHIELD_CIRCLE_BLUE, intParameter: 3 }
    case PwBlockName.MEDIEVAL_SHIELD_CIRCLE_RED:
      return { blockId: EelvlBlockId.MEDIEVAL_SHIELD_CIRCLE_BLUE, intParameter: 0 }
    case PwBlockName.MEDIEVAL_SHIELD_CURVED_BLUE:
      return { blockId: EelvlBlockId.MEDIEVAL_SHIELD_CURVED_BLUE, intParameter: 1 }
    case PwBlockName.MEDIEVAL_SHIELD_CURVED_GREEN:
      return { blockId: EelvlBlockId.MEDIEVAL_SHIELD_CURVED_BLUE, intParameter: 2 }
    case PwBlockName.MEDIEVAL_SHIELD_CURVED_YELLOW:
      return { blockId: EelvlBlockId.MEDIEVAL_SHIELD_CURVED_BLUE, intParameter: 3 }
    case PwBlockName.MEDIEVAL_SHIELD_CURVED_RED:
      return { blockId: EelvlBlockId.MEDIEVAL_SHIELD_CURVED_BLUE, intParameter: 0 }
    case PwBlockName.MEDIEVAL_BANNER_BLUE:
      return { blockId: EelvlBlockId.MEDIEVAL_BANNER_BLUE, intParameter: 1 }
    case PwBlockName.MEDIEVAL_BANNER_GREEN:
      return { blockId: EelvlBlockId.MEDIEVAL_BANNER_BLUE, intParameter: 2 }
    case PwBlockName.MEDIEVAL_BANNER_YELLOW:
      return { blockId: EelvlBlockId.MEDIEVAL_BANNER_BLUE, intParameter: 3 }
    case PwBlockName.MEDIEVAL_BANNER_RED:
      return { blockId: EelvlBlockId.MEDIEVAL_BANNER_BLUE, intParameter: 0 }
    case PwBlockName.DOMESTIC_LIGHT_BULB_TOP_ON:
      return { blockId: EelvlBlockId.DOMESTIC_LIGHT_BULB_TOP_ON, intParameter: 1 }
    case PwBlockName.DOMESTIC_LIGHT_BULB_TOP_OFF:
      return { blockId: EelvlBlockId.DOMESTIC_LIGHT_BULB_TOP_ON, intParameter: 2 }
    case PwBlockName.DOMESTIC_LIGHT_BULB_BOTTOM_ON:
      return { blockId: EelvlBlockId.DOMESTIC_LIGHT_BULB_TOP_ON, intParameter: 3 }
    case PwBlockName.DOMESTIC_LIGHT_BULB_BOTTOM_OFF:
      return { blockId: EelvlBlockId.DOMESTIC_LIGHT_BULB_TOP_ON, intParameter: 0 }
    case PwBlockName.DOMESTIC_BOTTOM_RIGHT:
      return { blockId: EelvlBlockId.DOMESTIC_BOTTOM_RIGHT, intParameter: 1 }
    case PwBlockName.DOMESTIC_PIPE_T_BOTTOM:
      return { blockId: EelvlBlockId.DOMESTIC_PIPE_T_BOTTOM, intParameter: 1 }
    case PwBlockName.DOMESTIC_PIPE_BOTTOM_LEFT:
      return { blockId: EelvlBlockId.DOMESTIC_BOTTOM_RIGHT, intParameter: 2 }
    case PwBlockName.DOMESTIC_PIPE_STRAIGHT_HORIZONTAL:
      return { blockId: EelvlBlockId.DOMESTIC_PIPE_STRAIGHT_HORIZONTAL, intParameter: 1 }
    case PwBlockName.DOMESTIC_PIPE_T_RIGHT:
      return { blockId: EelvlBlockId.DOMESTIC_PIPE_T_BOTTOM, intParameter: 0 }
    case PwBlockName.DOMESTIC_PIPE_T_LEFT:
      return { blockId: EelvlBlockId.DOMESTIC_PIPE_T_BOTTOM, intParameter: 3 }
    case PwBlockName.DOMESTIC_PIPE_STRAIGHT_VERTICAL:
      return { blockId: EelvlBlockId.DOMESTIC_PIPE_STRAIGHT_HORIZONTAL, intParameter: 0 }
    case PwBlockName.DOMESTIC_PIPE_TOP_RIGHT:
      return { blockId: EelvlBlockId.DOMESTIC_BOTTOM_RIGHT, intParameter: 0 }
    case PwBlockName.DOMESTIC_PIPE_T_TOP:
      return { blockId: EelvlBlockId.DOMESTIC_PIPE_T_BOTTOM, intParameter: 2 }
    case PwBlockName.DOMESTIC_PIPE_TOP_LEFT:
      return { blockId: EelvlBlockId.DOMESTIC_BOTTOM_RIGHT, intParameter: 3 }
    case PwBlockName.DOMESTIC_PAINTING_BLUE:
      return { blockId: EelvlBlockId.DOMESTIC_PAINTING_BLUE, intParameter: 1 }
    case PwBlockName.DOMESTIC_PAINTING_GREEN:
      return { blockId: EelvlBlockId.DOMESTIC_PAINTING_BLUE, intParameter: 3 }
    case PwBlockName.DOMESTIC_PAINTING_BLUE_DARK:
      return { blockId: EelvlBlockId.DOMESTIC_PAINTING_BLUE, intParameter: 2 }
    case PwBlockName.DOMESTIC_PAINTING_PURPLE:
      return { blockId: EelvlBlockId.DOMESTIC_PAINTING_BLUE, intParameter: 0 }
    case PwBlockName.DOMESTIC_VASE_BLUE:
      return { blockId: EelvlBlockId.DOMESTIC_VASE_YELLOW, intParameter: 0 }
    case PwBlockName.DOMESTIC_VASE_PURPLE:
      return { blockId: EelvlBlockId.DOMESTIC_VASE_YELLOW, intParameter: 3 }
    case PwBlockName.DOMESTIC_VASE_ORANGE:
      return { blockId: EelvlBlockId.DOMESTIC_VASE_YELLOW, intParameter: 2 }
    case PwBlockName.DOMESTIC_VASE_YELLOW:
      return { blockId: EelvlBlockId.DOMESTIC_VASE_YELLOW, intParameter: 1 }
    case PwBlockName.DOMESTIC_TELEVISION_BLACK:
      return { blockId: EelvlBlockId.DOMESTIC_TELEVISION_BLACK, intParameter: 1 }
    case PwBlockName.DOMESTIC_TELEVISION_GRAY:
      return { blockId: EelvlBlockId.DOMESTIC_TELEVISION_BLACK, intParameter: 2 }
    case PwBlockName.DOMESTIC_TELEVISION_BLUE:
      return { blockId: EelvlBlockId.DOMESTIC_TELEVISION_BLACK, intParameter: 3 }
    case PwBlockName.DOMESTIC_TELEVISION_YELLOW:
      return { blockId: EelvlBlockId.DOMESTIC_TELEVISION_BLACK, intParameter: 0 }
    case PwBlockName.DOMESTIC_WINDOW_BLACK:
      return { blockId: EelvlBlockId.DOMESTIC_WINDOW_BLACK, intParameter: 1 }
    case PwBlockName.DOMESTIC_WINDOW_BLUE:
      return { blockId: EelvlBlockId.DOMESTIC_WINDOW_BLACK, intParameter: 2 }
    case PwBlockName.DOMESTIC_WINDOW_ORANGE:
      return { blockId: EelvlBlockId.DOMESTIC_WINDOW_BLACK, intParameter: 3 }
    case PwBlockName.DOMESTIC_WINDOW_YELLOW:
      return { blockId: EelvlBlockId.DOMESTIC_WINDOW_BLACK, intParameter: 0 }
    case PwBlockName.DOMESTIC_HALF_YELLOW_LEFT:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_YELLOW_BOTTOM, intParameter: 2 }
    case PwBlockName.DOMESTIC_HALF_YELLOW_TOP:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_YELLOW_BOTTOM, intParameter: 3 }
    case PwBlockName.DOMESTIC_HALF_YELLOW_RIGHT:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_YELLOW_BOTTOM, intParameter: 0 }
    case PwBlockName.DOMESTIC_HALF_YELLOW_BOTTOM:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_YELLOW_BOTTOM, intParameter: 1 }
    case PwBlockName.DOMESTIC_HALF_BROWN_LEFT:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_BROWN_BOTTOM, intParameter: 2 }
    case PwBlockName.DOMESTIC_HALF_BROWN_TOP:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_BROWN_BOTTOM, intParameter: 3 }
    case PwBlockName.DOMESTIC_HALF_BROWN_RIGHT:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_BROWN_BOTTOM, intParameter: 0 }
    case PwBlockName.DOMESTIC_HALF_BROWN_BOTTOM:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_BROWN_BOTTOM, intParameter: 1 }
    case PwBlockName.DOMESTIC_HALF_WHITE_LEFT:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_WHITE_BOTTOM, intParameter: 2 }
    case PwBlockName.DOMESTIC_HALF_WHITE_TOP:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_WHITE_BOTTOM, intParameter: 3 }
    case PwBlockName.DOMESTIC_HALF_WHITE_RIGHT:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_WHITE_BOTTOM, intParameter: 0 }
    case PwBlockName.DOMESTIC_HALF_WHITE_BOTTOM:
      return { blockId: EelvlBlockId.DOMESTIC_HALF_WHITE_BOTTOM, intParameter: 1 }
    case PwBlockName.DOMESTIC_FRAME_BORDER_TOP_LEFT:
      return { blockId: EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL, intParameter: 5 }
    case PwBlockName.DOMESTIC_FRAME_BORDER_TOP:
      return { blockId: EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL, intParameter: 1 }
    case PwBlockName.DOMESTIC_FRAME_BORDER_TOP_RIGHT:
      return { blockId: EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL, intParameter: 6 }
    case PwBlockName.DOMESTIC_FRAME_BORDER_TOP_BOTTOM:
      return { blockId: EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL, intParameter: 9 }
    case PwBlockName.DOMESTIC_FRAME_BORDER_LEFT:
      return { blockId: EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL, intParameter: 4 }
    case PwBlockName.DOMESTIC_FRAME_BORDER_FULL:
      return { blockId: EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL, intParameter: 0 }
    case PwBlockName.DOMESTIC_FRAME_BORDER_RIGHT:
      return { blockId: EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL, intParameter: 2 }
    case PwBlockName.DOMESTIC_FRAME_BORDER_LEFT_RIGHT:
      return { blockId: EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL, intParameter: 10 }
    case PwBlockName.DOMESTIC_FRAME_BORDER_BOTTOM_LEFT:
      return { blockId: EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL, intParameter: 8 }
    case PwBlockName.DOMESTIC_FRAME_BORDER_BOTTOM:
      return { blockId: EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL, intParameter: 3 }
    case PwBlockName.DOMESTIC_FRAME_BORDER_BOTTOM_RIGHT:
      return { blockId: EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL, intParameter: 7 }
    case PwBlockName.DOJO_ROOFTOP_BLUE_LEFT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_LEFT, intParameter: 1 }
    case PwBlockName.DOJO_ROOFTOP_BLUE_RIGHT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_RIGHT, intParameter: 1 }
    case PwBlockName.DOJO_ROOFTOP_RED_LEFT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_LEFT, intParameter: 0 }
    case PwBlockName.DOJO_ROOFTOP_RED_RIGHT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_RIGHT, intParameter: 0 }
    case PwBlockName.DOJO_ROOFTOP_GREEN_LEFT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_LEFT, intParameter: 2 }
    case PwBlockName.DOJO_ROOFTOP_GREEN_RIGHT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_RIGHT, intParameter: 2 }
    case PwBlockName.DOJO_ROOFTOP_GREEN_DARK_LEFT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_DARK_LEFT, intParameter: 2 }
    case PwBlockName.DOJO_ROOFTOP_GREEN_DARK_RIGHT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_DARK_RIGHT, intParameter: 2 }
    case PwBlockName.DOJO_ROOFTOP_BLUE_DARK_LEFT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_DARK_LEFT, intParameter: 1 }
    case PwBlockName.DOJO_ROOFTOP_BLUE_DARK_RIGHT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_DARK_RIGHT, intParameter: 1 }
    case PwBlockName.DOJO_ROOFTOP_RED_DARK_LEFT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_DARK_LEFT, intParameter: 0 }
    case PwBlockName.DOJO_ROOFTOP_RED_DARK_RIGHT:
      return { blockId: EelvlBlockId.DOJO_ROOFTOP_BLUE_DARK_RIGHT, intParameter: 0 }
    case PwBlockName.CHRISTMAS_GIFT_HALF_RED:
      return { blockId: EelvlBlockId.CHRISTMAS_GIFT_HALF_RED, intParameter: 1 }
    case PwBlockName.CHRISTMAS_GIFT_HALF_GREEN:
      return { blockId: EelvlBlockId.CHRISTMAS_GIFT_HALF_GREEN, intParameter: 1 }
    case PwBlockName.CHRISTMAS_GIFT_HALF_WHITE:
      return { blockId: EelvlBlockId.CHRISTMAS_GIFT_HALF_WHITE, intParameter: 1 }
    case PwBlockName.CHRISTMAS_GIFT_HALF_BLUE:
      return { blockId: EelvlBlockId.CHRISTMAS_GIFT_HALF_BLUE, intParameter: 1 }
    case PwBlockName.CHRISTMAS_GIFT_HALF_YELLOW:
      return { blockId: EelvlBlockId.CHRISTMAS_GIFT_HALF_YELLOW, intParameter: 1 }
    case PwBlockName.CHRISTMAS_STRING_LIGHT_TOP_RED:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_TOP_RED, intParameter: 1 }
    case PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_RED:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_BOTTOM_RED, intParameter: 1 }
    case PwBlockName.CHRISTMAS_STRING_LIGHT_TOP_YELLOW:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_TOP_RED, intParameter: 3 }
    case PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_YELLOW:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_BOTTOM_RED, intParameter: 2 }
    case PwBlockName.CHRISTMAS_STRING_LIGHT_TOP_GREEN:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_TOP_RED, intParameter: 2 }
    case PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_GREEN:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_BOTTOM_RED, intParameter: 3 }
    case PwBlockName.CHRISTMAS_STRING_LIGHT_TOP_BLUE:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_TOP_RED, intParameter: 4 }
    case PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_BLUE:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_BOTTOM_RED, intParameter: 4 }
    case PwBlockName.CHRISTMAS_STRING_LIGHT_TOP_PURPLE:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_TOP_RED, intParameter: 0 }
    case PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_PURPLE:
      return { blockId: EelvlBlockId.CHRISTMAS_STRING_LIGHT_BOTTOM_RED, intParameter: 0 }
    case PwBlockName.SCIFI_LASER_BLUE_CORNER_BOTTOMRIGHT:
      return { blockId: EelvlBlockId.SCIFI_LASER_BLUE_CORNER_BOTTOMRIGHT, intParameter: 1 }
    case PwBlockName.SCIFI_LASER_BLUE_CORNER_BOTTOMLEFT:
      return { blockId: EelvlBlockId.SCIFI_LASER_BLUE_CORNER_BOTTOMRIGHT, intParameter: 2 }
    case PwBlockName.SCIFI_LASER_BLUE_STRAIGHT_HORIZONTAL:
      return { blockId: EelvlBlockId.SCIFI_LASER_BLUE_STRAIGHT_VERTICAL, intParameter: 1 }
    case PwBlockName.SCIFI_LASER_BLUE_CORNER_TOPRIGHT:
      return { blockId: EelvlBlockId.SCIFI_LASER_BLUE_CORNER_BOTTOMRIGHT, intParameter: 0 }
    case PwBlockName.SCIFI_LASER_BLUE_CORNER_TOPLEFT:
      return { blockId: EelvlBlockId.SCIFI_LASER_BLUE_CORNER_BOTTOMRIGHT, intParameter: 3 }
    case PwBlockName.SCIFI_LASER_BLUE_STRAIGHT_VERTICAL:
      return { blockId: EelvlBlockId.SCIFI_LASER_BLUE_STRAIGHT_VERTICAL, intParameter: 0 }
    case PwBlockName.SCIFI_LASER_GREEN_CORNER_BOTTOMRIGHT:
      return { blockId: EelvlBlockId.SCIFI_LASER_GREEN_CORNER_BOTTOMRIGHT, intParameter: 1 }
    case PwBlockName.SCIFI_LASER_GREEN_CORNER_BOTTOMLEFT:
      return { blockId: EelvlBlockId.SCIFI_LASER_GREEN_CORNER_BOTTOMRIGHT, intParameter: 2 }
    case PwBlockName.SCIFI_LASER_GREEN_STRAIGHT_HORIZONTAL:
      return { blockId: EelvlBlockId.SCIFI_LASER_GREEN_STRAIGHT_VERTICAL, intParameter: 1 }
    case PwBlockName.SCIFI_LASER_GREEN_CORNER_TOPRIGHT:
      return { blockId: EelvlBlockId.SCIFI_LASER_GREEN_CORNER_BOTTOMRIGHT, intParameter: 0 }
    case PwBlockName.SCIFI_LASER_GREEN_CORNER_TOPLEFT:
      return { blockId: EelvlBlockId.SCIFI_LASER_GREEN_CORNER_BOTTOMRIGHT, intParameter: 3 }
    case PwBlockName.SCIFI_LASER_GREEN_STRAIGHT_VERTICAL:
      return { blockId: EelvlBlockId.SCIFI_LASER_GREEN_STRAIGHT_VERTICAL, intParameter: 0 }
    case PwBlockName.SCIFI_LASER_ORANGE_CORNER_BOTTOMRIGHT:
      return { blockId: EelvlBlockId.SCIFI_LASER_ORANGE_CORNER_BOTTOMRIGHT, intParameter: 1 }
    case PwBlockName.SCIFI_LASER_ORANGE_CORNER_BOTTOMLEFT:
      return { blockId: EelvlBlockId.SCIFI_LASER_ORANGE_CORNER_BOTTOMRIGHT, intParameter: 2 }
    case PwBlockName.SCIFI_LASER_ORANGE_STRAIGHT_HORIZONTAL:
      return { blockId: EelvlBlockId.SCIFI_LASER_ORANGE_STRAIGHT_VERITICAL, intParameter: 1 }
    case PwBlockName.SCIFI_LASER_ORANGE_CORNER_TOPRIGHT:
      return { blockId: EelvlBlockId.SCIFI_LASER_ORANGE_CORNER_BOTTOMRIGHT, intParameter: 0 }
    case PwBlockName.SCIFI_LASER_ORANGE_CORNER_TOPLEFT:
      return { blockId: EelvlBlockId.SCIFI_LASER_ORANGE_CORNER_BOTTOMRIGHT, intParameter: 3 }
    case PwBlockName.SCIFI_LASER_ORANGE_STRAIGHT_VERITICAL:
      return { blockId: EelvlBlockId.SCIFI_LASER_ORANGE_STRAIGHT_VERITICAL, intParameter: 0 }
    case PwBlockName.SCIFI_LASER_RED_CORNER_BOTTOMRIGHT:
      return { blockId: EelvlBlockId.SCIFI_LASER_RED_CORNER_BOTTOMRIGHT, intParameter: 1 }
    case PwBlockName.SCIFI_LASER_RED_CORNER_BOTTOMLEFT:
      return { blockId: EelvlBlockId.SCIFI_LASER_RED_CORNER_BOTTOMRIGHT, intParameter: 2 }
    case PwBlockName.SCIFI_LASER_RED_STRAIGHT_HORIZONTAL:
      return { blockId: EelvlBlockId.SCIFI_LASER_RED_STRAIGHT_VERTICAL, intParameter: 1 }
    case PwBlockName.SCIFI_LASER_RED_CORNER_TOPRIGHT:
      return { blockId: EelvlBlockId.SCIFI_LASER_RED_CORNER_BOTTOMRIGHT, intParameter: 0 }
    case PwBlockName.SCIFI_LASER_RED_CORNER_TOPLEFT:
      return { blockId: EelvlBlockId.SCIFI_LASER_RED_CORNER_BOTTOMRIGHT, intParameter: 3 }
    case PwBlockName.SCIFI_LASER_RED_STRAIGHT_VERTICAL:
      return { blockId: EelvlBlockId.SCIFI_LASER_RED_STRAIGHT_VERTICAL, intParameter: 0 }
    case PwBlockName.HALFBLOCKS_WHITE_LEFT:
      return { blockId: EelvlBlockId.HALFBLOCKS_WHITE_BOTTOM, intParameter: 2 }
    case PwBlockName.HALFBLOCKS_WHITE_TOP:
      return { blockId: EelvlBlockId.HALFBLOCKS_WHITE_BOTTOM, intParameter: 3 }
    case PwBlockName.HALFBLOCKS_WHITE_RIGHT:
      return { blockId: EelvlBlockId.HALFBLOCKS_WHITE_BOTTOM, intParameter: 0 }
    case PwBlockName.HALFBLOCKS_WHITE_BOTTOM:
      return { blockId: EelvlBlockId.HALFBLOCKS_WHITE_BOTTOM, intParameter: 1 }
    case PwBlockName.HALFBLOCKS_GRAY_LEFT:
      return { blockId: EelvlBlockId.HALFBLOCKS_GRAY_BOTTOM, intParameter: 2 }
    case PwBlockName.HALFBLOCKS_GRAY_TOP:
      return { blockId: EelvlBlockId.HALFBLOCKS_GRAY_BOTTOM, intParameter: 3 }
    case PwBlockName.HALFBLOCKS_GRAY_RIGHT:
      return { blockId: EelvlBlockId.HALFBLOCKS_GRAY_BOTTOM, intParameter: 0 }
    case PwBlockName.HALFBLOCKS_GRAY_BOTTOM:
      return { blockId: EelvlBlockId.HALFBLOCKS_GRAY_BOTTOM, intParameter: 1 }
    case PwBlockName.HALFBLOCKS_BLACK_LEFT:
      return { blockId: EelvlBlockId.HALFBLOCKS_BLACK_BOTTOM, intParameter: 2 }
    case PwBlockName.HALFBLOCKS_BLACK_TOP:
      return { blockId: EelvlBlockId.HALFBLOCKS_BLACK_BOTTOM, intParameter: 3 }
    case PwBlockName.HALFBLOCKS_BLACK_RIGHT:
      return { blockId: EelvlBlockId.HALFBLOCKS_BLACK_BOTTOM, intParameter: 0 }
    case PwBlockName.HALFBLOCKS_BLACK_BOTTOM:
      return { blockId: EelvlBlockId.HALFBLOCKS_BLACK_BOTTOM, intParameter: 1 }
    case PwBlockName.HALFBLOCKS_RED_LEFT:
      return { blockId: EelvlBlockId.HALFBLOCKS_RED_BOTTOM, intParameter: 2 }
    case PwBlockName.HALFBLOCKS_RED_TOP:
      return { blockId: EelvlBlockId.HALFBLOCKS_RED_BOTTOM, intParameter: 3 }
    case PwBlockName.HALFBLOCKS_RED_RIGHT:
      return { blockId: EelvlBlockId.HALFBLOCKS_RED_BOTTOM, intParameter: 0 }
    case PwBlockName.HALFBLOCKS_RED_BOTTOM:
      return { blockId: EelvlBlockId.HALFBLOCKS_RED_BOTTOM, intParameter: 1 }
    case PwBlockName.HALFBLOCKS_ORANGE_LEFT:
      return { blockId: EelvlBlockId.HALFBLOCKS_ORANGE_BOTTOM, intParameter: 2 }
    case PwBlockName.HALFBLOCKS_ORANGE_TOP:
      return { blockId: EelvlBlockId.HALFBLOCKS_ORANGE_BOTTOM, intParameter: 3 }
    case PwBlockName.HALFBLOCKS_ORANGE_RIGHT:
      return { blockId: EelvlBlockId.HALFBLOCKS_ORANGE_BOTTOM, intParameter: 0 }
    case PwBlockName.HALFBLOCKS_ORANGE_BOTTOM:
      return { blockId: EelvlBlockId.HALFBLOCKS_ORANGE_BOTTOM, intParameter: 1 }
    case PwBlockName.HALFBLOCKS_YELLOW_LEFT:
      return { blockId: EelvlBlockId.HALFBLOCKS_YELLOW_BOTTOM, intParameter: 2 }
    case PwBlockName.HALFBLOCKS_YELLOW_TOP:
      return { blockId: EelvlBlockId.HALFBLOCKS_YELLOW_BOTTOM, intParameter: 3 }
    case PwBlockName.HALFBLOCKS_YELLOW_RIGHT:
      return { blockId: EelvlBlockId.HALFBLOCKS_YELLOW_BOTTOM, intParameter: 0 }
    case PwBlockName.HALFBLOCKS_YELLOW_BOTTOM:
      return { blockId: EelvlBlockId.HALFBLOCKS_YELLOW_BOTTOM, intParameter: 1 }
    case PwBlockName.HALFBLOCKS_GREEN_LEFT:
      return { blockId: EelvlBlockId.HALFBLOCKS_GREEN_BOTTOM, intParameter: 2 }
    case PwBlockName.HALFBLOCKS_GREEN_TOP:
      return { blockId: EelvlBlockId.HALFBLOCKS_GREEN_BOTTOM, intParameter: 3 }
    case PwBlockName.HALFBLOCKS_GREEN_RIGHT:
      return { blockId: EelvlBlockId.HALFBLOCKS_GREEN_BOTTOM, intParameter: 0 }
    case PwBlockName.HALFBLOCKS_GREEN_BOTTOM:
      return { blockId: EelvlBlockId.HALFBLOCKS_GREEN_BOTTOM, intParameter: 1 }
    case PwBlockName.HALFBLOCKS_CYAN_LEFT:
      return { blockId: EelvlBlockId.HALFBLOCKS_CYAN_BOTTOM, intParameter: 2 }
    case PwBlockName.HALFBLOCKS_CYAN_TOP:
      return { blockId: EelvlBlockId.HALFBLOCKS_CYAN_BOTTOM, intParameter: 3 }
    case PwBlockName.HALFBLOCKS_CYAN_RIGHT:
      return { blockId: EelvlBlockId.HALFBLOCKS_CYAN_BOTTOM, intParameter: 0 }
    case PwBlockName.HALFBLOCKS_CYAN_BOTTOM:
      return { blockId: EelvlBlockId.HALFBLOCKS_CYAN_BOTTOM, intParameter: 1 }
    case PwBlockName.HALFBLOCKS_BLUE_LEFT:
      return { blockId: EelvlBlockId.HALFBLOCKS_BLUE_BOTTOM, intParameter: 2 }
    case PwBlockName.HALFBLOCKS_BLUE_TOP:
      return { blockId: EelvlBlockId.HALFBLOCKS_BLUE_BOTTOM, intParameter: 3 }
    case PwBlockName.HALFBLOCKS_BLUE_RIGHT:
      return { blockId: EelvlBlockId.HALFBLOCKS_BLUE_BOTTOM, intParameter: 0 }
    case PwBlockName.HALFBLOCKS_BLUE_BOTTOM:
      return { blockId: EelvlBlockId.HALFBLOCKS_BLUE_BOTTOM, intParameter: 1 }
    case PwBlockName.HALFBLOCKS_MAGENTA_LEFT:
      return { blockId: EelvlBlockId.HALFBLOCKS_MAGENTA_BOTTOM, intParameter: 2 }
    case PwBlockName.HALFBLOCKS_MAGENTA_TOP:
      return { blockId: EelvlBlockId.HALFBLOCKS_MAGENTA_BOTTOM, intParameter: 3 }
    case PwBlockName.HALFBLOCKS_MAGENTA_RIGHT:
      return { blockId: EelvlBlockId.HALFBLOCKS_MAGENTA_BOTTOM, intParameter: 0 }
    case PwBlockName.HALFBLOCKS_MAGENTA_BOTTOM:
      return { blockId: EelvlBlockId.HALFBLOCKS_MAGENTA_BOTTOM, intParameter: 1 }
    case PwBlockName.WINTER_HALF_SNOW_LEFT:
      return { blockId: EelvlBlockId.WINTER_HALF_SNOW_BOTTOM, intParameter: 2 }
    case PwBlockName.WINTER_HALF_SNOW_TOP:
      return { blockId: EelvlBlockId.WINTER_HALF_SNOW_BOTTOM, intParameter: 3 }
    case PwBlockName.WINTER_HALF_SNOW_RIGHT:
      return { blockId: EelvlBlockId.WINTER_HALF_SNOW_BOTTOM, intParameter: 0 }
    case PwBlockName.WINTER_HALF_SNOW_BOTTOM:
      return { blockId: EelvlBlockId.WINTER_HALF_SNOW_BOTTOM, intParameter: 1 }
    case PwBlockName.WINTER_HALF_ICE_LEFT:
      return { blockId: EelvlBlockId.WINTER_HALF_ICE_BOTTOM, intParameter: 2 }
    case PwBlockName.WINTER_HALF_ICE_TOP:
      return { blockId: EelvlBlockId.WINTER_HALF_ICE_BOTTOM, intParameter: 3 }
    case PwBlockName.WINTER_HALF_ICE_RIGHT:
      return { blockId: EelvlBlockId.WINTER_HALF_ICE_BOTTOM, intParameter: 0 }
    case PwBlockName.WINTER_HALF_ICE_BOTTOM:
      return { blockId: EelvlBlockId.WINTER_HALF_ICE_BOTTOM, intParameter: 1 }
    case PwBlockName.WINTER_ICE_DRIFT_TOP_LEFT:
      return { blockId: EelvlBlockId.WINTER_ICE_DRIFT_BOTTOM_LEFT }
    case PwBlockName.WINTER_ICE_DRIFT_TOP_RIGHT:
      return { blockId: EelvlBlockId.WINTER_ICE_DRIFT_BOTTOM_RIGHT }
    case PwBlockName.WINTER_SNOW_DRIFT_TOP_LEFT:
      return { blockId: EelvlBlockId.WINTER_SNOW_DRIFT_BOTTOM_LEFT }
    case PwBlockName.WINTER_SNOW_DRIFT_TOP_RIGHT:
      return { blockId: EelvlBlockId.WINTER_SNOW_DRIFT_BOTTOM_RIGHT }
    case PwBlockName.FAIRYTALE_HALF_ORANGE_LEFT:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_ORANGE_BOTTOM, intParameter: 2 }
    case PwBlockName.FAIRYTALE_HALF_ORANGE_TOP:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_ORANGE_BOTTOM, intParameter: 3 }
    case PwBlockName.FAIRYTALE_HALF_ORANGE_RIGHT:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_ORANGE_BOTTOM, intParameter: 0 }
    case PwBlockName.FAIRYTALE_HALF_ORANGE_BOTTOM:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_ORANGE_BOTTOM, intParameter: 1 }
    case PwBlockName.FAIRYTALE_HALF_GREEN_LEFT:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_GREEN_BOTTOM, intParameter: 2 }
    case PwBlockName.FAIRYTALE_HALF_GREEN_TOP:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_GREEN_BOTTOM, intParameter: 3 }
    case PwBlockName.FAIRYTALE_HALF_GREEN_RIGHT:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_GREEN_BOTTOM, intParameter: 0 }
    case PwBlockName.FAIRYTALE_HALF_GREEN_BOTTOM:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_GREEN_BOTTOM, intParameter: 1 }
    case PwBlockName.FAIRYTALE_HALF_BLUE_LEFT:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_BLUE_BOTTOM, intParameter: 2 }
    case PwBlockName.FAIRYTALE_HALF_BLUE_TOP:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_BLUE_BOTTOM, intParameter: 3 }
    case PwBlockName.FAIRYTALE_HALF_BLUE_RIGHT:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_BLUE_BOTTOM, intParameter: 0 }
    case PwBlockName.FAIRYTALE_HALF_BLUE_BOTTOM:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_BLUE_BOTTOM, intParameter: 1 }
    case PwBlockName.FAIRYTALE_HALF_PINK_LEFT:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_PINK_BOTTOM, intParameter: 2 }
    case PwBlockName.FAIRYTALE_HALF_PINK_TOP:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_PINK_BOTTOM, intParameter: 3 }
    case PwBlockName.FAIRYTALE_HALF_PINK_RIGHT:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_PINK_BOTTOM, intParameter: 0 }
    case PwBlockName.FAIRYTALE_HALF_PINK_BOTTOM:
      return { blockId: EelvlBlockId.FAIRYTALE_HALF_PINK_BOTTOM, intParameter: 1 }
    case PwBlockName.FAIRYTALE_FLOWER_BLUE:
      return { blockId: EelvlBlockId.FAIRYTALE_FLOWER_BLUE, intParameter: 1 }
    case PwBlockName.FAIRYTALE_FLOWER_ORANGE:
      return { blockId: EelvlBlockId.FAIRYTALE_FLOWER_BLUE, intParameter: 2 }
    case PwBlockName.FAIRYTALE_FLOWER_PINK:
      return { blockId: EelvlBlockId.FAIRYTALE_FLOWER_BLUE, intParameter: 0 }
    case PwBlockName.SPRING_DIRT_DRIFT_TOP_LEFT:
      return { blockId: EelvlBlockId.SPRING_DIRT_DRIFT_BOTTOM_LEFT }
    case PwBlockName.SPRING_DIRT_DRIFT_TOP_RIGHT:
      return { blockId: EelvlBlockId.SPRING_DIRT_DRIFT_BOTTOM_RIGHT }
    case PwBlockName.SPRING_DAISY_WHITE:
      return { blockId: EelvlBlockId.SPRING_DAISY_WHITE, intParameter: 1 }
    case PwBlockName.SPRING_DAISY_BLUE:
      return { blockId: EelvlBlockId.SPRING_DAISY_WHITE, intParameter: 2 }
    case PwBlockName.SPRING_DAISY_PINK:
      return { blockId: EelvlBlockId.SPRING_DAISY_WHITE, intParameter: 0 }
    case PwBlockName.SPRING_TULIP_RED:
      return { blockId: EelvlBlockId.SPRING_TULIP_RED, intParameter: 1 }
    case PwBlockName.SPRING_TULIP_YELLOW:
      return { blockId: EelvlBlockId.SPRING_TULIP_RED, intParameter: 2 }
    case PwBlockName.SPRING_TULIP_PINK:
      return { blockId: EelvlBlockId.SPRING_TULIP_RED, intParameter: 0 }
    case PwBlockName.SPRING_DAFFODIL_WHITE:
      return { blockId: EelvlBlockId.SPRING_DAFFODIL_YELLOW, intParameter: 2 }
    case PwBlockName.SPRING_DAFFODIL_YELLOW:
      return { blockId: EelvlBlockId.SPRING_DAFFODIL_YELLOW, intParameter: 1 }
    case PwBlockName.SPRING_DAFFODIL_ORANGE:
      return { blockId: EelvlBlockId.SPRING_DAFFODIL_YELLOW, intParameter: 0 }
    case PwBlockName.ONEWAY_WHITE_LEFT:
      return { blockId: EelvlBlockId.ONEWAY_WHITE_TOP, intParameter: 0 }
    case PwBlockName.ONEWAY_WHITE_TOP:
      return { blockId: EelvlBlockId.ONEWAY_WHITE_TOP, intParameter: 1 }
    case PwBlockName.ONEWAY_WHITE_RIGHT:
      return { blockId: EelvlBlockId.ONEWAY_WHITE_TOP, intParameter: 2 }
    case PwBlockName.ONEWAY_WHITE_BOTTOM:
      return { blockId: EelvlBlockId.ONEWAY_WHITE_TOP, intParameter: 3 }
    case PwBlockName.ONEWAY_GRAY_LEFT:
      return { blockId: EelvlBlockId.ONEWAY_GRAY_TOP, intParameter: 0 }
    case PwBlockName.ONEWAY_GRAY_TOP:
      return { blockId: EelvlBlockId.ONEWAY_GRAY_TOP, intParameter: 1 }
    case PwBlockName.ONEWAY_GRAY_RIGHT:
      return { blockId: EelvlBlockId.ONEWAY_GRAY_TOP, intParameter: 2 }
    case PwBlockName.ONEWAY_GRAY_BOTTOM:
      return { blockId: EelvlBlockId.ONEWAY_GRAY_TOP, intParameter: 3 }
    case PwBlockName.ONEWAY_BLACK_LEFT:
      return { blockId: EelvlBlockId.ONEWAY_BLACK_TOP, intParameter: 0 }
    case PwBlockName.ONEWAY_BLACK_TOP:
      return { blockId: EelvlBlockId.ONEWAY_BLACK_TOP, intParameter: 1 }
    case PwBlockName.ONEWAY_BLACK_RIGHT:
      return { blockId: EelvlBlockId.ONEWAY_BLACK_TOP, intParameter: 2 }
    case PwBlockName.ONEWAY_BLACK_BOTTOM:
      return { blockId: EelvlBlockId.ONEWAY_BLACK_TOP, intParameter: 3 }
    case PwBlockName.ONEWAY_RED_LEFT:
      return { blockId: EelvlBlockId.ONEWAY_RED_TOP, intParameter: 0 }
    case PwBlockName.ONEWAY_RED_TOP:
      return { blockId: EelvlBlockId.ONEWAY_RED_TOP, intParameter: 1 }
    case PwBlockName.ONEWAY_RED_RIGHT:
      return { blockId: EelvlBlockId.ONEWAY_RED_TOP, intParameter: 2 }
    case PwBlockName.ONEWAY_RED_BOTTOM:
      return { blockId: EelvlBlockId.ONEWAY_RED_TOP, intParameter: 3 }
    case PwBlockName.ONEWAY_ORANGE_LEFT:
      return { blockId: EelvlBlockId.ONEWAY_ORANGE_TOP, intParameter: 0 }
    case PwBlockName.ONEWAY_ORANGE_TOP:
      return { blockId: EelvlBlockId.ONEWAY_ORANGE_TOP, intParameter: 1 }
    case PwBlockName.ONEWAY_ORANGE_RIGHT:
      return { blockId: EelvlBlockId.ONEWAY_ORANGE_TOP, intParameter: 2 }
    case PwBlockName.ONEWAY_ORANGE_BOTTOM:
      return { blockId: EelvlBlockId.ONEWAY_ORANGE_TOP, intParameter: 3 }
    case PwBlockName.ONEWAY_YELLOW_LEFT:
      return { blockId: EelvlBlockId.ONEWAY_YELLOW_TOP, intParameter: 0 }
    case PwBlockName.ONEWAY_YELLOW_TOP:
      return { blockId: EelvlBlockId.ONEWAY_YELLOW_TOP, intParameter: 1 }
    case PwBlockName.ONEWAY_YELLOW_RIGHT:
      return { blockId: EelvlBlockId.ONEWAY_YELLOW_TOP, intParameter: 2 }
    case PwBlockName.ONEWAY_YELLOW_BOTTOM:
      return { blockId: EelvlBlockId.ONEWAY_YELLOW_TOP, intParameter: 3 }
    case PwBlockName.ONEWAY_GREEN_LEFT:
      return { blockId: EelvlBlockId.ONEWAY_GREEN_TOP, intParameter: 0 }
    case PwBlockName.ONEWAY_GREEN_TOP:
      return { blockId: EelvlBlockId.ONEWAY_GREEN_TOP, intParameter: 1 }
    case PwBlockName.ONEWAY_GREEN_RIGHT:
      return { blockId: EelvlBlockId.ONEWAY_GREEN_TOP, intParameter: 2 }
    case PwBlockName.ONEWAY_GREEN_BOTTOM:
      return { blockId: EelvlBlockId.ONEWAY_GREEN_TOP, intParameter: 3 }
    case PwBlockName.ONEWAY_CYAN_LEFT:
      return { blockId: EelvlBlockId.ONEWAY_CYAN_TOP, intParameter: 0 }
    case PwBlockName.ONEWAY_CYAN_TOP:
      return { blockId: EelvlBlockId.ONEWAY_CYAN_TOP, intParameter: 1 }
    case PwBlockName.ONEWAY_CYAN_RIGHT:
      return { blockId: EelvlBlockId.ONEWAY_CYAN_TOP, intParameter: 2 }
    case PwBlockName.ONEWAY_CYAN_BOTTOM:
      return { blockId: EelvlBlockId.ONEWAY_CYAN_TOP, intParameter: 3 }
    case PwBlockName.ONEWAY_BLUE_LEFT:
      return { blockId: EelvlBlockId.ONEWAY_BLUE_TOP, intParameter: 0 }
    case PwBlockName.ONEWAY_BLUE_TOP:
      return { blockId: EelvlBlockId.ONEWAY_BLUE_TOP, intParameter: 1 }
    case PwBlockName.ONEWAY_BLUE_RIGHT:
      return { blockId: EelvlBlockId.ONEWAY_BLUE_TOP, intParameter: 2 }
    case PwBlockName.ONEWAY_BLUE_BOTTOM:
      return { blockId: EelvlBlockId.ONEWAY_BLUE_TOP, intParameter: 3 }
    case PwBlockName.ONEWAY_MAGENTA_LEFT:
      return { blockId: EelvlBlockId.ONEWAY_MAGENTA_TOP, intParameter: 0 }
    case PwBlockName.ONEWAY_MAGENTA_TOP:
      return { blockId: EelvlBlockId.ONEWAY_MAGENTA_TOP, intParameter: 1 }
    case PwBlockName.ONEWAY_MAGENTA_RIGHT:
      return { blockId: EelvlBlockId.ONEWAY_MAGENTA_TOP, intParameter: 2 }
    case PwBlockName.ONEWAY_MAGENTA_BOTTOM:
      return { blockId: EelvlBlockId.ONEWAY_MAGENTA_TOP, intParameter: 3 }
    case PwBlockName.DUNGEON_PILLAR_MIDDLE_GRAY:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_MIDDLE_GRAY, intParameter: 1 }
    case PwBlockName.DUNGEON_PILLAR_BOTTOM_GRAY:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_BOTTOM_GRAY, intParameter: 1 }
    case PwBlockName.DUNGEON_PILLAR_MIDDLE_GREEN:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_MIDDLE_GRAY, intParameter: 2 }
    case PwBlockName.DUNGEON_PILLAR_BOTTOM_GREEN:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_BOTTOM_GRAY, intParameter: 2 }
    case PwBlockName.DUNGEON_PILLAR_MIDDLE_BLUE:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_MIDDLE_GRAY, intParameter: 3 }
    case PwBlockName.DUNGEON_PILLAR_BOTTOM_BLUE:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_BOTTOM_GRAY, intParameter: 3 }
    case PwBlockName.DUNGEON_PILLAR_MIDDLE_PURPLE:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_MIDDLE_GRAY, intParameter: 0 }
    case PwBlockName.DUNGEON_PILLAR_BOTTOM_PURPLE:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_BOTTOM_GRAY, intParameter: 0 }
    case PwBlockName.DUNGEON_ONEWAY_PILLAR_TOP_GRAY:
      return { blockId: EelvlBlockId.DUNGEON_ONEWAY_PILLAR_TOP_GRAY, intParameter: 1 }
    case PwBlockName.DUNGEON_ONEWAY_PILLAR_TOP_GREEN:
      return { blockId: EelvlBlockId.DUNGEON_ONEWAY_PILLAR_TOP_GRAY, intParameter: 2 }
    case PwBlockName.DUNGEON_ONEWAY_PILLAR_TOP_BLUE:
      return { blockId: EelvlBlockId.DUNGEON_ONEWAY_PILLAR_TOP_GRAY, intParameter: 3 }
    case PwBlockName.DUNGEON_ONEWAY_PILLAR_TOP_PURPLE:
      return { blockId: EelvlBlockId.DUNGEON_ONEWAY_PILLAR_TOP_GRAY, intParameter: 0 }
    case PwBlockName.DUNGEON_STEEL_ARC_LEFT_GRAY:
      return { blockId: EelvlBlockId.DUNGEON_STEEL_ARC_LEFT_GRAY, intParameter: 1 }
    case PwBlockName.DUNGEON_PILLAR_ARC_RIGHT_GRAY:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_ARC_RIGHT_GRAY, intParameter: 1 }
    case PwBlockName.DUNGEON_STEEL_ARC_LEFT_GREEN:
      return { blockId: EelvlBlockId.DUNGEON_STEEL_ARC_LEFT_GRAY, intParameter: 2 }
    case PwBlockName.DUNGEON_PILLAR_ARC_RIGHT_GREEN:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_ARC_RIGHT_GRAY, intParameter: 2 }
    case PwBlockName.DUNGEON_STEEL_ARC_LEFT_BLUE:
      return { blockId: EelvlBlockId.DUNGEON_STEEL_ARC_LEFT_GRAY, intParameter: 3 }
    case PwBlockName.DUNGEON_PILLAR_ARC_RIGHT_BLUE:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_ARC_RIGHT_GRAY, intParameter: 3 }
    case PwBlockName.DUNGEON_STEEL_ARC_LEFT_PURPLE:
      return { blockId: EelvlBlockId.DUNGEON_STEEL_ARC_LEFT_GRAY, intParameter: 0 }
    case PwBlockName.DUNGEON_PILLAR_ARC_RIGHT_PURPLE:
      return { blockId: EelvlBlockId.DUNGEON_PILLAR_ARC_RIGHT_GRAY, intParameter: 0 }
    case PwBlockName.DUNGEON_TORCH_YELLOW:
      return { blockId: EelvlBlockId.DUNGEON_TORCH_YELLOW, intParameter: 1 }
    case PwBlockName.DUNGEON_TORCH_GREEN:
      return { blockId: EelvlBlockId.DUNGEON_TORCH_YELLOW, intParameter: 3 }
    case PwBlockName.DUNGEON_TORCH_BLUE:
      return { blockId: EelvlBlockId.DUNGEON_TORCH_YELLOW, intParameter: 2 }
    case PwBlockName.DUNGEON_TORCH_PURPLE:
      return { blockId: EelvlBlockId.DUNGEON_TORCH_YELLOW, intParameter: 0 }
    case PwBlockName.RETAIL_FLAG_RED:
      return { blockId: EelvlBlockId.RETAIL_FLAG_RED, intParameter: 1 }
    case PwBlockName.RETAIL_FLAG_GREEN:
      return { blockId: EelvlBlockId.RETAIL_FLAG_RED, intParameter: 3 }
    case PwBlockName.RETAIL_FLAG_YELLOW:
      return { blockId: EelvlBlockId.RETAIL_FLAG_RED, intParameter: 2 }
    case PwBlockName.RETAIL_FLAG_CYAN:
      return { blockId: EelvlBlockId.RETAIL_FLAG_RED, intParameter: 4 }
    case PwBlockName.RETAIL_FLAG_BLUE:
      return { blockId: EelvlBlockId.RETAIL_FLAG_RED, intParameter: 5 }
    case PwBlockName.RETAIL_FLAG_PURPLE:
      return { blockId: EelvlBlockId.RETAIL_FLAG_RED, intParameter: 0 }
    case PwBlockName.RETAIL_AWNING_RED:
      return { blockId: EelvlBlockId.RETAIL_AWNING_RED, intParameter: 1 }
    case PwBlockName.RETAIL_AWNING_GREEN:
      return { blockId: EelvlBlockId.RETAIL_AWNING_RED, intParameter: 3 }
    case PwBlockName.RETAIL_AWNING_YELLOW:
      return { blockId: EelvlBlockId.RETAIL_AWNING_RED, intParameter: 2 }
    case PwBlockName.RETAIL_AWNING_CYAN:
      return { blockId: EelvlBlockId.RETAIL_AWNING_RED, intParameter: 4 }
    case PwBlockName.RETAIL_AWNING_BLUE:
      return { blockId: EelvlBlockId.RETAIL_AWNING_RED, intParameter: 5 }
    case PwBlockName.RETAIL_AWNING_PURPLE:
      return { blockId: EelvlBlockId.RETAIL_AWNING_RED, intParameter: 0 }
    case PwBlockName.SUMMER_ICE_CREAM_VANILLA:
      return { blockId: EelvlBlockId.SUMMER_ICE_CREAM_VANILLA, intParameter: 1 }
    case PwBlockName.SUMMER_ICE_CREAM_CHOCOLATE:
      return { blockId: EelvlBlockId.SUMMER_ICE_CREAM_VANILLA, intParameter: 2 }
    case PwBlockName.SUMMER_ICE_CREAM_SRAWBERRY:
      return { blockId: EelvlBlockId.SUMMER_ICE_CREAM_VANILLA, intParameter: 3 }
    case PwBlockName.SUMMER_ICE_CREAM_MINT:
      return { blockId: EelvlBlockId.SUMMER_ICE_CREAM_VANILLA, intParameter: 0 }
    case PwBlockName.MINE_CRYSTAL_RED:
      return { blockId: EelvlBlockId.MINE_CRYSTAL_RED, intParameter: 1 }
    case PwBlockName.MINE_CRYSTAL_GREEN:
      return { blockId: EelvlBlockId.MINE_CRYSTAL_RED, intParameter: 3 }
    case PwBlockName.MINE_CRYSTAL_YELLOW:
      return { blockId: EelvlBlockId.MINE_CRYSTAL_RED, intParameter: 2 }
    case PwBlockName.MINE_CRYSTAL_CYAN:
      return { blockId: EelvlBlockId.MINE_CRYSTAL_RED, intParameter: 4 }
    case PwBlockName.MINE_CRYSTAL_BLUE:
      return { blockId: EelvlBlockId.MINE_CRYSTAL_RED, intParameter: 5 }
    case PwBlockName.MINE_CRYSTAL_PURPLE:
      return { blockId: EelvlBlockId.MINE_CRYSTAL_RED, intParameter: 0 }
    case PwBlockName.HAUNTED_WINDOW_CURVED_OFF:
      return { blockId: EelvlBlockId.HAUNTED_WINDOW_CURVED_OFF, intParameter: 1 }
    case PwBlockName.HAUNTED_WINDOW_CURVED_ON:
      return { blockId: EelvlBlockId.HAUNTED_WINDOW_CURVED_OFF, intParameter: 0 }
    case PwBlockName.HAUNTED_WINDOW_CIRCLE_OFF:
      return { blockId: EelvlBlockId.HAUNTED_WINDOW_CIRCLE_OFF, intParameter: 1 }
    case PwBlockName.HAUNTED_WINDOW_CIRCLE_ON:
      return { blockId: EelvlBlockId.HAUNTED_WINDOW_CIRCLE_OFF, intParameter: 0 }
    case PwBlockName.HAUNTED_LANTERN_OFF:
      return { blockId: EelvlBlockId.HAUNTED_LANTERN_OFF, intParameter: 1 }
    case PwBlockName.HAUNTED_LANTERN_ON:
      return { blockId: EelvlBlockId.HAUNTED_LANTERN_OFF, intParameter: 0 }
    case PwBlockName.MONSTER_TEETH_LARGE_TOP:
      return { blockId: EelvlBlockId.MONSTER_TEETH_LARGE_BOTTOM, intParameter: 3 }
    case PwBlockName.MONSTER_TEETH_LARGE_BOTTOM:
      return { blockId: EelvlBlockId.MONSTER_TEETH_LARGE_BOTTOM, intParameter: 1 }
    case PwBlockName.MONSTER_TEETH_LARGE_LEFT:
      return { blockId: EelvlBlockId.MONSTER_TEETH_LARGE_BOTTOM, intParameter: 2 }
    case PwBlockName.MONSTER_TEETH_LARGE_RIGHT:
      return { blockId: EelvlBlockId.MONSTER_TEETH_LARGE_BOTTOM, intParameter: 0 }
    case PwBlockName.MONSTER_TEETH_MEDIUM_TOP:
      return { blockId: EelvlBlockId.MONSTER_TEETH_MEDIUM_BOTTOM, intParameter: 3 }
    case PwBlockName.MONSTER_TEETH_MEDIUM_BOTTOM:
      return { blockId: EelvlBlockId.MONSTER_TEETH_MEDIUM_BOTTOM, intParameter: 1 }
    case PwBlockName.MONSTER_TEETH_MEDIUM_LEFT:
      return { blockId: EelvlBlockId.MONSTER_TEETH_MEDIUM_BOTTOM, intParameter: 2 }
    case PwBlockName.MONSTER_TEETH_MEDIUM_RIGHT:
      return { blockId: EelvlBlockId.MONSTER_TEETH_MEDIUM_BOTTOM, intParameter: 0 }
    case PwBlockName.MONSTER_TEETH_SMALL_TOP:
      return { blockId: EelvlBlockId.MONSTER_TEETH_SMALL_BOTTOM, intParameter: 3 }
    case PwBlockName.MONSTER_TEETH_SMALL_BOTTOM:
      return { blockId: EelvlBlockId.MONSTER_TEETH_SMALL_BOTTOM, intParameter: 1 }
    case PwBlockName.MONSTER_TEETH_SMALL_LEFT:
      return { blockId: EelvlBlockId.MONSTER_TEETH_SMALL_BOTTOM, intParameter: 2 }
    case PwBlockName.MONSTER_TEETH_SMALL_RIGHT:
      return { blockId: EelvlBlockId.MONSTER_TEETH_SMALL_BOTTOM, intParameter: 0 }
    case PwBlockName.FALL_LEAVES_DRIFT_TOP_LEFT:
      return { blockId: EelvlBlockId.FALL_LEAVES_DRIFT_BOTTOM_LEFT }
    case PwBlockName.FALL_LEAVES_DRIFT_TOP_RIGHT:
      return { blockId: EelvlBlockId.FALL_LEAVES_DRIFT_BOTTOM_RIGHT }
    case PwBlockName.NEWYEARS_BALLOON_RED:
      return { blockId: EelvlBlockId.NEWYEARS_BALLOON_ORANGE, intParameter: 2 }
    case PwBlockName.NEWYEARS_BALLOON_ORANGE:
      return { blockId: EelvlBlockId.NEWYEARS_BALLOON_ORANGE, intParameter: 1 }
    case PwBlockName.NEWYEARS_BALLOON_GREEN:
      return { blockId: EelvlBlockId.NEWYEARS_BALLOON_ORANGE, intParameter: 0 }
    case PwBlockName.NEWYEARS_BALLOON_BLUE:
      return { blockId: EelvlBlockId.NEWYEARS_BALLOON_ORANGE, intParameter: 4 }
    case PwBlockName.NEWYEARS_BALLOON_PURPLE:
      return { blockId: EelvlBlockId.NEWYEARS_BALLOON_ORANGE, intParameter: 3 }
    case PwBlockName.NEWYEARS_STREAMER_RED:
      return { blockId: EelvlBlockId.NEWYEARS_STREAMER_ORANGE, intParameter: 2 }
    case PwBlockName.NEWYEARS_STREAMER_ORANGE:
      return { blockId: EelvlBlockId.NEWYEARS_STREAMER_ORANGE, intParameter: 1 }
    case PwBlockName.NEWYEARS_STREAMER_GREEN:
      return { blockId: EelvlBlockId.NEWYEARS_STREAMER_ORANGE, intParameter: 0 }
    case PwBlockName.NEWYEARS_STREAMER_BLUE:
      return { blockId: EelvlBlockId.NEWYEARS_STREAMER_ORANGE, intParameter: 4 }
    case PwBlockName.NEWYEARS_STREAMER_PURPLE:
      return { blockId: EelvlBlockId.NEWYEARS_STREAMER_ORANGE, intParameter: 3 }
    case PwBlockName.RESTAURANT_GLASS_EMPTY:
      return { blockId: EelvlBlockId.RESTAURANT_GLASS_EMPTY, intParameter: 1 }
    case PwBlockName.RESTAURANT_GLASS_WATER:
      return { blockId: EelvlBlockId.RESTAURANT_GLASS_EMPTY, intParameter: 2 }
    case PwBlockName.RESTAURANT_GLASS_MILK:
      return { blockId: EelvlBlockId.RESTAURANT_GLASS_EMPTY, intParameter: 3 }
    case PwBlockName.RESTAURANT_GLASS_ORANGEJUICE:
      return { blockId: EelvlBlockId.RESTAURANT_GLASS_EMPTY, intParameter: 0 }
    case PwBlockName.RESTAURANT_PLATE_EMPTY:
      return { blockId: EelvlBlockId.RESTAURANT_PLATE_EMPTY, intParameter: 1 }
    case PwBlockName.RESTAURANT_PLATE_CHICKEN:
      return { blockId: EelvlBlockId.RESTAURANT_PLATE_EMPTY, intParameter: 2 }
    case PwBlockName.RESTAURANT_PLATE_HAM:
      return { blockId: EelvlBlockId.RESTAURANT_PLATE_EMPTY, intParameter: 3 }
    case PwBlockName.RESTAURANT_PLATE_FISH:
      return { blockId: EelvlBlockId.RESTAURANT_PLATE_EMPTY, intParameter: 4 }
    case PwBlockName.RESTAURANT_PLATE_CAKE_CHOCOLATE:
      return { blockId: EelvlBlockId.RESTAURANT_PLATE_EMPTY, intParameter: 1 }
    case PwBlockName.RESTAURANT_PLATE_PIE_CHERRY:
      return { blockId: EelvlBlockId.RESTAURANT_PLATE_EMPTY, intParameter: 1 }
    case PwBlockName.RESTAURANT_PLATE_COOKIES:
      return { blockId: EelvlBlockId.RESTAURANT_PLATE_EMPTY, intParameter: 0 }
    case PwBlockName.RESTAURANT_BOWL_EMPTY:
      return { blockId: EelvlBlockId.RESTAURANT_BOWL_EMPTY, intParameter: 1 }
    case PwBlockName.RESTAURANT_BOWL_SALAD:
      return { blockId: EelvlBlockId.RESTAURANT_BOWL_EMPTY, intParameter: 3 }
    case PwBlockName.RESTAURANT_BOWL_SPAGHETTI:
      return { blockId: EelvlBlockId.RESTAURANT_BOWL_EMPTY, intParameter: 2 }
    case PwBlockName.RESTAURANT_BOWL_ICECREAM:
      return { blockId: EelvlBlockId.RESTAURANT_BOWL_EMPTY, intParameter: 0 }
    case PwBlockName.TOXIC_ONEWAY_RUSTED_LEFT:
      return { blockId: EelvlBlockId.TOXIC_ONEWAY_RUSTED_TOP, intParameter: 0 }
    case PwBlockName.TOXIC_ONEWAY_RUSTED_TOP:
      return { blockId: EelvlBlockId.TOXIC_ONEWAY_RUSTED_TOP, intParameter: 1 }
    case PwBlockName.TOXIC_ONEWAY_RUSTED_RIGHT:
      return { blockId: EelvlBlockId.TOXIC_ONEWAY_RUSTED_TOP, intParameter: 2 }
    case PwBlockName.TOXIC_ONEWAY_RUSTED_BOTTOM:
      return { blockId: EelvlBlockId.TOXIC_ONEWAY_RUSTED_TOP, intParameter: 3 }
    case PwBlockName.TOXIC_WASTE_BARREL_OFF:
      return { blockId: EelvlBlockId.TOXIC_WASTE_BARREL_OFF, intParameter: 1 }
    case PwBlockName.TOXIC_WASTE_BARREL_ON:
      return { blockId: EelvlBlockId.TOXIC_WASTE_BARREL_OFF, intParameter: 0 }
    case PwBlockName.TOXIC_SEWER_DRAIN_EMPTY:
      return { blockId: EelvlBlockId.TOXIC_SEWER_DRAIN_EMPTY, intParameter: 1 }
    case PwBlockName.TOXIC_SEWER_DRAIN_WATER:
      return { blockId: EelvlBlockId.TOXIC_SEWER_DRAIN_EMPTY, intParameter: 2 }
    case PwBlockName.TOXIC_SEWER_DRAIN_WASTE:
      return { blockId: EelvlBlockId.TOXIC_SEWER_DRAIN_EMPTY, intParameter: 0 }
    case PwBlockName.TOXIC_SEWER_DRAIN_LAVA:
      return { blockId: EelvlBlockId.TOXIC_SEWER_DRAIN_EMPTY, intParameter: 3 }
    case PwBlockName.TOXIC_SEWER_DRAIN_MUD:
      return { blockId: EelvlBlockId.TOXIC_SEWER_DRAIN_EMPTY, intParameter: 4 }
    default: {
      if (pwBlockName === undefined && eelvlLayer !== EelvlLayer.BACKGROUND) {
        return createMissingBlockSign(`Unknown Block ID: ${pwBlock.bId}`)
      }
      const eelvlBlockId: EelvlBlockId = EelvlBlockId[pwBlockName as keyof typeof EelvlBlockId]
      if (eelvlBlockId === undefined && eelvlLayer !== EelvlLayer.BACKGROUND) {
        return createMissingBlockSign(`Missing EELVL block: ${pwBlockName}`)
      }

      return { blockId: eelvlBlockId }
    }
  }
}

function createMissingBlockSign(message: string): EelvlBlock {
  return { blockId: EelvlBlockId.SIGN_NORMAL, signType: 0, signText: message }
}

function getPwToEelvlEffectsJumpHeightBlock(pwBlock: Block): EelvlBlock {
  const jumpHeight = pwBlock.args[0]
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
  const speed = pwBlock.args[0]
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
  const gravityForce = pwBlock.args[0]
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

function getPwToEelvlNoteBlock(pwBlock: Block, eelvlBlockId: EelvlBlockId): EelvlBlock {
  return { blockId: eelvlBlockId, intParameter: (pwBlock.args[0] as Uint8Array).at(0) }
}

function getPwToEelvlSwitchActivatorBlock(pwBlock: Block, eelvlBlockId: EelvlBlockId): EelvlBlock {
  if (pwBlock.args[1] === 0) {
    return { blockId: eelvlBlockId, intParameter: pwBlock.args[0] as number }
  } else {
    const pwBlockName =
      eelvlBlockId === EelvlBlockId.SWITCH_LOCAL_ACTIVATOR
        ? PwBlockName.SWITCH_LOCAL_ACTIVATOR
        : PwBlockName.SWITCH_GLOBAL_ACTIVATOR
    return createMissingBlockSign(`${pwBlockName} switch id: ${pwBlock.args[0]}, switch state: ON`)
  }
}
