import { ByteArray } from '@/classes/ByteArray.ts'
import { EelvlBlockId, hasEelvlBlockOneIntParameter, hasEelvlBlockOneUIntParameter, hasEelvlBlockTwoIntParameters, isEelvlNpc } from '@/enums/EelvlBlockId.ts'
import type { BlockArg } from 'pw-js-world'
import { Block, LayerType } from 'pw-js-world'
import { EelvlBlock } from '@/types/EelvlBlock.ts'
import { vec2 } from '@basementuniverse/vec'
import { EelvlFileHeader } from '@/types/WorldData.ts'
import { PwBlockName } from '@/enums/PwBlockName.ts'
import { getBlockId, placeMultipleBlocks } from '@/services/WorldService.ts'
import { WorldBlock } from '@/types/WorldBlock.ts'
import { cloneDeep } from 'lodash-es'
import { EelvlLayer } from '@/enums/EelvlLayer.ts'
import { getPwGameWorldHelper, usePWClientStore } from '@/stores/PWClientStore.ts'
import { sendGlobalChatMessage } from '@/services/ChatMessageService.ts'

export async function importFromEelvl(fileData: ArrayBuffer) {
  try {
    const bytes = new ByteArray(new Uint8Array(fileData))
    bytes.uncompress()

    const world = {} as EelvlFileHeader
    world.ownerName = bytes.readUTF()
    world.name = bytes.readUTF()
    world.width = bytes.readInt()
    world.height = bytes.readInt()
    world.gravMultiplier = bytes.readFloat()
    world.backgroundColor = bytes.readUnsignedInt()
    world.description = bytes.readUTF()
    world.isCampaign = bytes.readBoolean()
    world.crewId = bytes.readUTF()
    world.crewName = bytes.readUTF()
    world.crewStatus = bytes.readInt()
    world.minimapEnabled = bytes.readBoolean()
    world.ownerId = bytes.readUTF()

    const pwMapWidth = getPwGameWorldHelper().width
    const pwMapHeight = getPwGameWorldHelper().height

    const pwBlock3DArray: [Block[][], Block[][]] = [[], []]
    for (let l = 0; l < 2; l++) {
      pwBlock3DArray[l] = []
      for (let x = 0; x < pwMapWidth; x++) {
        pwBlock3DArray[l][x] = []
        for (let y = 0; y < pwMapHeight; y++) {
          pwBlock3DArray[l][x][y] = new Block(0)
        }
      }
    }

    while (bytes.hashposition < bytes.length) {
      const eelvlBlockId = bytes.readInt()
      const eelvlLayer = bytes.readInt()
      const blockPositions = readPositionsByteArrays(bytes)
      const eelvlBlock = readEelvlBlock(bytes, eelvlBlockId, eelvlLayer)
      eelvlBlock.blockId = eelvlBlockId

      const pwLayer = mapLayerEelvlToPw(eelvlLayer)
      if (pwLayer === null) {
        continue;
      }
      const pwBlock: Block = mapBlockIdEelvlToPw(eelvlBlock)
      for (const pos of blockPositions) {
        if (pos.x >= 0 && pos.y >= 0 && pos.x < pwMapWidth && pos.y < pwMapHeight) {
          pwBlock3DArray[pwLayer][pos.x][pos.y] = pwBlock
        }
      }
    }

    let pwBlocks = [] as WorldBlock[]
    for (let l = 0; l < 2; l++) {
      for (let x = 0; x < pwMapWidth; x++) {
        for (let y = 0; y < pwMapHeight; y++) {
          const pwBlock = cloneDeep(pwBlock3DArray[l][x][y])
          pwBlocks.push({ block: pwBlock, layer: l, pos: vec2(x, y) })
        }
      }
    }

    usePWClientStore().totalBlocksLeftToReceiveFromWorldImport = pwBlocks.length
    placeMultipleBlocks(pwBlocks)
  } catch (e) {
    usePWClientStore().totalBlocksLeftToReceiveFromWorldImport = 0
    sendGlobalChatMessage('Unknown error occurred while importing eelvl file.')
  }
}

function mapLayerEelvlToPw(eelvlLayer: number) {
  switch (eelvlLayer) {
    case EelvlLayer.BACKGROUND:
      return LayerType.Background
    case EelvlLayer.FOREGROUND:
      return LayerType.Foreground
    case EelvlLayer.EBE_VISION:
      return null
    case EelvlLayer.EBE_TRIBG:
      return null
    default:
      throw Error(`Unknown layer type: ${eelvlLayer}`)
  }
}

function readEelvlBlock(bytes: ByteArray, eelvlBlockId: number, eelvlLayer: number) {
  const eelvlBlock = {} as EelvlBlock

  if (eelvlLayer === EelvlLayer.EBE_VISION) {
    bytes.readInt();
  }

  switch (eelvlBlockId) {
    case EelvlBlockId.PORTAL:
    case EelvlBlockId.PORTAL_INVISIBLE:
      eelvlBlock.intParameter = bytes.readInt()
      eelvlBlock.portalId = bytes.readInt()
      eelvlBlock.portalTarget = bytes.readInt()
      break
    case EelvlBlockId.SIGN_NORMAL:
      eelvlBlock.signText = bytes.readUTF().replace('\\n', '\n')
      eelvlBlock.signType = bytes.readInt()
      break
    case EelvlBlockId.PORTAL_WORLD:
      eelvlBlock.worldPortalTargetWorldId = bytes.readUTF()
      eelvlBlock.worldPortalTargetSpawnPointId = bytes.readInt()
      break
    case EelvlBlockId.LABEL:
      eelvlBlock.labelText = bytes.readUTF()
      eelvlBlock.labelTextColor = bytes.readUTF()
      eelvlBlock.labelWrapLength = bytes.readInt()
      break
    default:
      if (hasEelvlBlockOneIntParameter(eelvlBlockId, eelvlLayer)) {
        eelvlBlock.intParameter = bytes.readInt()
      } else if (hasEelvlBlockTwoIntParameters(eelvlBlockId, eelvlLayer)) {
        eelvlBlock.intParameter = bytes.readInt()
        eelvlBlock.intParameterTwo = bytes.readInt()
      } else if (hasEelvlBlockOneUIntParameter(eelvlBlockId)) {
        eelvlBlock.uintParameter = bytes.readUnsignedInt()
      } else if (isEelvlNpc(eelvlBlockId)) {
        eelvlBlock.npcName = bytes.readUTF()
        eelvlBlock.npcMessage1 = bytes.readUTF()
        eelvlBlock.npcMessage2 = bytes.readUTF()
        eelvlBlock.npcMessage3 = bytes.readUTF()
      }
  }

  return eelvlBlock
}

function readPositionsByteArrays(bytes: ByteArray): vec2[] {
  const positions: vec2[] = []
  let length: number
  const positionsX: ByteArray = new ByteArray(0)
  const positionsY: ByteArray = new ByteArray(0)

  length = bytes.readUnsignedInt()
  bytes.readBytes(positionsX, 0, length)
  length = bytes.readUnsignedInt()
  bytes.readBytes(positionsY, 0, length)

  for (let i: number = 0; i < positionsX.length / 2; i++) {
    positions.push(vec2(positionsX.readUnsignedShort(), positionsY.readUnsignedShort()))
  }

  return positions
}

function createBlock(pwBlockName: PwBlockName, args?: BlockArg[]): Block {
  return new Block(getBlockId(pwBlockName), args)
}

function mapBlockIdEelvlToPw(eelvlBlock: EelvlBlock): Block {
  switch (eelvlBlock.blockId) {
    case EelvlBlockId.COIN_GOLD_DOOR:
      return createBlock(PwBlockName.COIN_GOLD_DOOR, [eelvlBlock.intParameter!])
    case EelvlBlockId.COIN_GOLD_GATE:
      return createBlock(PwBlockName.COIN_GOLD_GATE, [eelvlBlock.intParameter!])
    case EelvlBlockId.COIN_BLUE_DOOR:
      return createBlock(PwBlockName.COIN_BLUE_DOOR, [eelvlBlock.intParameter!])
    case EelvlBlockId.COIN_BLUE_GATE:
      return createBlock(PwBlockName.COIN_BLUE_GATE, [eelvlBlock.intParameter!])
    case EelvlBlockId.EFFECTS_JUMP_HEIGHT:
      return getEelvlToPwEffectsJumpHeightBlock(eelvlBlock)
    case EelvlBlockId.EFFECTS_FLY:
      return createBlock(PwBlockName.EFFECTS_FLY, [eelvlBlock.intParameter === 1])
    case EelvlBlockId.EFFECTS_SPEED:
      return getEelvlToPwEffectsSpeedBlock(eelvlBlock)
    case EelvlBlockId.EFFECTS_INVULNERABILITY:
      return createBlock(PwBlockName.EFFECTS_INVULNERABILITY, [eelvlBlock.intParameter === 1])
    case EelvlBlockId.EFFECTS_CURSE:
      return createBlock(PwBlockName.EFFECTS_CURSE, [eelvlBlock.intParameter!])
    case EelvlBlockId.EFFECTS_ZOMBIE:
      return createBlock(PwBlockName.EFFECTS_ZOMBIE, [eelvlBlock.intParameter!])
    case EelvlBlockId.EFFECTS_GRAVITYFORCE:
      return getEelvlToPwEffectsGravityForceBlock(eelvlBlock)
    case EelvlBlockId.EFFECTS_MULTI_JUMP:
      return getEelvlToPwEffectsMultiJumpBlock(eelvlBlock)
    case EelvlBlockId.EFFECTS_GRAVITY_DOWN:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.EFFECTS_GRAVITY_LEFT)
        case 2:
          return createBlock(PwBlockName.EFFECTS_GRAVITY_UP)
        case 3:
          return createBlock(PwBlockName.EFFECTS_GRAVITY_RIGHT)
        case 0:
          return createBlock(PwBlockName.EFFECTS_GRAVITY_DOWN)
        case 4:
          return createBlock(PwBlockName.EFFECTS_GRAVITY_OFF)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.TOOL_PORTAL_WORLD_SPAWN:
      return createBlock(PwBlockName.TOOL_PORTAL_WORLD_SPAWN, [eelvlBlock.intParameter!])
    case EelvlBlockId.SIGN_NORMAL:
      switch (eelvlBlock.signType) {
        case 0:
          return createBlock(PwBlockName.SIGN_NORMAL, [eelvlBlock.signText!])
        case 2:
          return createBlock(PwBlockName.SIGN_RED, [eelvlBlock.signText!])
        case 1:
          return createBlock(PwBlockName.SIGN_BLUE, [eelvlBlock.signText!])
        case 3:
          return createBlock(PwBlockName.SIGN_GOLD, [eelvlBlock.signText!])
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.PORTAL:
      return getEelvlToPwPortalBlock(eelvlBlock, PwBlockName.PORTAL)
    case EelvlBlockId.PORTAL_INVISIBLE:
      return getEelvlToPwPortalBlock(eelvlBlock, PwBlockName.PORTAL_INVISIBLE)
    case EelvlBlockId.PORTAL_WORLD:
      return createBlock(PwBlockName.PORTAL_WORLD, [
        eelvlBlock.worldPortalTargetWorldId!,
        eelvlBlock.worldPortalTargetSpawnPointId!,
      ])
    case EelvlBlockId.SWITCH_LOCAL_TOGGLE:
      return createBlock(PwBlockName.SWITCH_LOCAL_TOGGLE, [eelvlBlock.intParameter!])
    case EelvlBlockId.SWITCH_LOCAL_ACTIVATOR:
      return getEelvlToPwSwitchActivatorBlock(eelvlBlock, PwBlockName.SWITCH_LOCAL_ACTIVATOR)
    case EelvlBlockId.SWITCH_LOCAL_DOOR:
      return createBlock(PwBlockName.SWITCH_LOCAL_DOOR, [eelvlBlock.intParameter!])
    case EelvlBlockId.SWITCH_LOCAL_GATE:
      return createBlock(PwBlockName.SWITCH_LOCAL_GATE, [eelvlBlock.intParameter!])
    case EelvlBlockId.SWITCH_GLOBAL_TOGGLE:
      return createBlock(PwBlockName.SWITCH_GLOBAL_TOGGLE, [eelvlBlock.intParameter!])
    case EelvlBlockId.SWITCH_GLOBAL_ACTIVATOR:
      return getEelvlToPwSwitchActivatorBlock(eelvlBlock, PwBlockName.SWITCH_GLOBAL_ACTIVATOR)
    case EelvlBlockId.SWITCH_GLOBAL_DOOR:
      return createBlock(PwBlockName.SWITCH_GLOBAL_DOOR, [eelvlBlock.intParameter!])
    case EelvlBlockId.SWITCH_GLOBAL_GATE:
      return createBlock(PwBlockName.SWITCH_GLOBAL_GATE, [eelvlBlock.intParameter!])
    case EelvlBlockId.HAZARD_SPIKES_BROWN_UP:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.HAZARD_SPIKES_BROWN_UP)
        case 2:
          return createBlock(PwBlockName.HAZARD_SPIKES_BROWN_RIGHT)
        case 3:
          return createBlock(PwBlockName.HAZARD_SPIKES_BROWN_DOWN)
        case 0:
          return createBlock(PwBlockName.HAZARD_SPIKES_BROWN_LEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HAZARD_SPIKES_WHITE_UP:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.HAZARD_SPIKES_WHITE_UP)
        case 2:
          return createBlock(PwBlockName.HAZARD_SPIKES_WHITE_RIGHT)
        case 3:
          return createBlock(PwBlockName.HAZARD_SPIKES_WHITE_DOWN)
        case 0:
          return createBlock(PwBlockName.HAZARD_SPIKES_WHITE_LEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HAZARD_SPIKES_GRAY_UP:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.HAZARD_SPIKES_GRAY_UP)
        case 2:
          return createBlock(PwBlockName.HAZARD_SPIKES_GRAY_RIGHT)
        case 3:
          return createBlock(PwBlockName.HAZARD_SPIKES_GRAY_DOWN)
        case 0:
          return createBlock(PwBlockName.HAZARD_SPIKES_GRAY_LEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HAZARD_SPIKES_RED_UP:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.HAZARD_SPIKES_RED_UP)
        case 2:
          return createBlock(PwBlockName.HAZARD_SPIKES_RED_RIGHT)
        case 3:
          return createBlock(PwBlockName.HAZARD_SPIKES_RED_DOWN)
        case 0:
          return createBlock(PwBlockName.HAZARD_SPIKES_RED_LEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HAZARD_SPIKES_YELLOW_UP:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.HAZARD_SPIKES_YELLOW_UP)
        case 2:
          return createBlock(PwBlockName.HAZARD_SPIKES_YELLOW_RIGHT)
        case 3:
          return createBlock(PwBlockName.HAZARD_SPIKES_YELLOW_DOWN)
        case 0:
          return createBlock(PwBlockName.HAZARD_SPIKES_YELLOW_LEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HAZARD_SPIKES_GREEN_UP:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.HAZARD_SPIKES_GREEN_UP)
        case 2:
          return createBlock(PwBlockName.HAZARD_SPIKES_GREEN_RIGHT)
        case 3:
          return createBlock(PwBlockName.HAZARD_SPIKES_GREEN_DOWN)
        case 0:
          return createBlock(PwBlockName.HAZARD_SPIKES_GREEN_LEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HAZARD_SPIKES_BLUE_UP:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.HAZARD_SPIKES_BLUE_UP)
        case 2:
          return createBlock(PwBlockName.HAZARD_SPIKES_BLUE_RIGHT)
        case 3:
          return createBlock(PwBlockName.HAZARD_SPIKES_BLUE_DOWN)
        case 0:
          return createBlock(PwBlockName.HAZARD_SPIKES_BLUE_LEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HAZARD_DEATH_DOOR:
      return createBlock(PwBlockName.HAZARD_DEATH_DOOR, [eelvlBlock.intParameter!])
    case EelvlBlockId.HAZARD_DEATH_GATE:
      return createBlock(PwBlockName.HAZARD_DEATH_GATE, [eelvlBlock.intParameter!])
    case EelvlBlockId.NOTE_DRUM:
      return getEelvlToPwNoteBlock(eelvlBlock, PwBlockName.NOTE_DRUM)
    case EelvlBlockId.NOTE_PIANO:
      return getEelvlToPwNoteBlock(eelvlBlock, PwBlockName.NOTE_PIANO)
    case EelvlBlockId.NOTE_GUITAR:
      return getEelvlToPwNoteBlock(eelvlBlock, PwBlockName.NOTE_GUITAR)
    case EelvlBlockId.TEAM_EFFECT_NONE:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.TEAM_EFFECT_NONE)
        case 1:
          return createBlock(PwBlockName.TEAM_EFFECT_RED)
        case 2:
          return createBlock(PwBlockName.TEAM_EFFECT_GREEN)
        case 3:
          return createBlock(PwBlockName.TEAM_EFFECT_BLUE)
        case 4:
          return createBlock(PwBlockName.TEAM_EFFECT_CYAN)
        case 5:
          return createBlock(PwBlockName.TEAM_EFFECT_MAGENTA)
        case 6:
          return createBlock(PwBlockName.TEAM_EFFECT_YELLOW)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.TEAM_NONE_DOOR:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.TEAM_NONE_DOOR)
        case 1:
          return createBlock(PwBlockName.TEAM_RED_DOOR)
        case 2:
          return createBlock(PwBlockName.TEAM_GREEN_DOOR)
        case 3:
          return createBlock(PwBlockName.TEAM_BLUE_DOOR)
        case 4:
          return createBlock(PwBlockName.TEAM_CYAN_DOOR)
        case 5:
          return createBlock(PwBlockName.TEAM_MAGENTA_DOOR)
        case 6:
          return createBlock(PwBlockName.TEAM_YELLOW_DOOR)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.TEAM_NONE_GATE:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.TEAM_NONE_GATE)
        case 1:
          return createBlock(PwBlockName.TEAM_RED_GATE)
        case 2:
          return createBlock(PwBlockName.TEAM_GREEN_GATE)
        case 3:
          return createBlock(PwBlockName.TEAM_BLUE_GATE)
        case 4:
          return createBlock(PwBlockName.TEAM_CYAN_GATE)
        case 5:
          return createBlock(PwBlockName.TEAM_MAGENTA_GATE)
        case 6:
          return createBlock(PwBlockName.TEAM_YELLOW_GATE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALLOWEEN_TREE_BRANCH_BOTTOM_RIGHT:
      switch (eelvlBlock.intParameter) {
        case 3:
          return createBlock(PwBlockName.HALLOWEEN_TREE_BRANCH_TOP_LEFT)
        case 0:
          return createBlock(PwBlockName.HALLOWEEN_TREE_BRANCH_TOP_RIGHT)
        case 2:
          return createBlock(PwBlockName.HALLOWEEN_TREE_BRANCH_BOTTOM_LEFT)
        case 1:
          return createBlock(PwBlockName.HALLOWEEN_TREE_BRANCH_BOTTOM_RIGHT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALLOWEEN_PUMPKIN_OFF:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.HALLOWEEN_PUMPKIN_ON)
        case 1:
          return createBlock(PwBlockName.HALLOWEEN_PUMPKIN_OFF)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALLOWEEN_EYES_ORANGE:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.HALLOWEEN_EYES_YELLOW)
        case 1:
          return createBlock(PwBlockName.HALLOWEEN_EYES_ORANGE)
        case 2:
          return createBlock(PwBlockName.HALLOWEEN_EYES_PURPLE)
        case 3:
          return createBlock(PwBlockName.HALLOWEEN_EYES_GREEN)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.INDUSTRIAL_PISTON_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.INDUSTRIAL_PISTON_LEFT)
        case 0:
          return createBlock(PwBlockName.INDUSTRIAL_PISTON_RIGHT)
        case 1:
          return createBlock(PwBlockName.INDUSTRIAL_PISTON_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.INDUSTRIAL_PIPE_THIN_HORIZONTAL:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.INDUSTRIAL_PIPE_THIN_HORIZONTAL)
        case 0:
          return createBlock(PwBlockName.INDUSTRIAL_PIPE_THIN_VERTICAL)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.INDUSTRIAL_PIPE_DECORATION_HORIZONTAL:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.INDUSTRIAL_PIPE_DECORATION_HORIZONTAL)
        case 0:
          return createBlock(PwBlockName.INDUSTRIAL_PIPE_DECORATION_VERTICAL)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.MEDIEVAL_SCAFFOLDING_STRAIGHT_HORIZONTAL:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.MEDIEVAL_SCAFFOLDING_STRAIGHT_T)
        case 1:
          return createBlock(PwBlockName.MEDIEVAL_SCAFFOLDING_STRAIGHT_HORIZONTAL)
        case 0:
          return createBlock(PwBlockName.MEDIEVAL_SCAFFOLDING_ANGLED_MIDDLE)
        case 3:
          return createBlock(PwBlockName.MEDIEVAL_SCAFFOLDING_STRAIGHT_VERTICAL)
        case 4:
          return createBlock(PwBlockName.MEDIEVAL_SCAFFOLDING_ANGLED_RIGHT)
        case 5:
          return createBlock(PwBlockName.MEDIEVAL_SCAFFOLDING_ANGLED_LEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.MEDIEVAL_AXE_TOP_RIGHT:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.MEDIEVAL_AXE_TOP_LEFT)
        case 1:
          return createBlock(PwBlockName.MEDIEVAL_AXE_TOP_RIGHT)
        case 3:
          return createBlock(PwBlockName.MEDIEVAL_AXE_BOTTOM_LEFT)
        case 2:
          return createBlock(PwBlockName.MEDIEVAL_AXE_BOTTOM_RIGHT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.MEDIEVAL_SWORD_BOTTOM_RIGHT:
      switch (eelvlBlock.intParameter) {
        case 3:
          return createBlock(PwBlockName.MEDIEVAL_SWORD_TOP_LEFT)
        case 0:
          return createBlock(PwBlockName.MEDIEVAL_SWORD_TOP_RIGHT)
        case 2:
          return createBlock(PwBlockName.MEDIEVAL_SWORD_BOTTOM_LEFT)
        case 1:
          return createBlock(PwBlockName.MEDIEVAL_SWORD_BOTTOM_RIGHT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.MEDIEVAL_SHIELD_CIRCLE_BLUE:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.MEDIEVAL_SHIELD_CIRCLE_BLUE)
        case 2:
          return createBlock(PwBlockName.MEDIEVAL_SHIELD_CIRCLE_GREEN)
        case 3:
          return createBlock(PwBlockName.MEDIEVAL_SHIELD_CIRCLE_YELLOW)
        case 0:
          return createBlock(PwBlockName.MEDIEVAL_SHIELD_CIRCLE_RED)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.MEDIEVAL_SHIELD_CURVED_BLUE:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.MEDIEVAL_SHIELD_CURVED_BLUE)
        case 2:
          return createBlock(PwBlockName.MEDIEVAL_SHIELD_CURVED_GREEN)
        case 3:
          return createBlock(PwBlockName.MEDIEVAL_SHIELD_CURVED_YELLOW)
        case 0:
          return createBlock(PwBlockName.MEDIEVAL_SHIELD_CURVED_RED)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.MEDIEVAL_BANNER_BLUE:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.MEDIEVAL_BANNER_BLUE)
        case 2:
          return createBlock(PwBlockName.MEDIEVAL_BANNER_GREEN)
        case 3:
          return createBlock(PwBlockName.MEDIEVAL_BANNER_YELLOW)
        case 0:
          return createBlock(PwBlockName.MEDIEVAL_BANNER_RED)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_LIGHT_BULB_TOP_ON:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DOMESTIC_LIGHT_BULB_TOP_ON)
        case 2:
          return createBlock(PwBlockName.DOMESTIC_LIGHT_BULB_TOP_OFF)
        case 3:
          return createBlock(PwBlockName.DOMESTIC_LIGHT_BULB_BOTTOM_ON)
        case 0:
          return createBlock(PwBlockName.DOMESTIC_LIGHT_BULB_BOTTOM_OFF)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_BOTTOM_RIGHT:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DOMESTIC_BOTTOM_RIGHT)
        case 2:
          return createBlock(PwBlockName.DOMESTIC_PIPE_BOTTOM_LEFT)
        case 0:
          return createBlock(PwBlockName.DOMESTIC_PIPE_TOP_RIGHT)
        case 3:
          return createBlock(PwBlockName.DOMESTIC_PIPE_TOP_LEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_PIPE_T_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DOMESTIC_PIPE_T_BOTTOM)
        case 0:
          return createBlock(PwBlockName.DOMESTIC_PIPE_T_RIGHT)
        case 3:
          return createBlock(PwBlockName.DOMESTIC_PIPE_T_LEFT)
        case 2:
          return createBlock(PwBlockName.DOMESTIC_PIPE_T_TOP)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_PIPE_STRAIGHT_HORIZONTAL:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DOMESTIC_PIPE_STRAIGHT_HORIZONTAL)
        case 0:
          return createBlock(PwBlockName.DOMESTIC_PIPE_STRAIGHT_VERTICAL)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_PAINTING_BLUE:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DOMESTIC_PAINTING_BLUE)
        case 3:
          return createBlock(PwBlockName.DOMESTIC_PAINTING_GREEN)
        case 2:
          return createBlock(PwBlockName.DOMESTIC_PAINTING_BLUE_DARK)
        case 0:
          return createBlock(PwBlockName.DOMESTIC_PAINTING_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_VASE_YELLOW:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.DOMESTIC_VASE_BLUE)
        case 3:
          return createBlock(PwBlockName.DOMESTIC_VASE_PURPLE)
        case 2:
          return createBlock(PwBlockName.DOMESTIC_VASE_ORANGE)
        case 1:
          return createBlock(PwBlockName.DOMESTIC_VASE_YELLOW)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_TELEVISION_BLACK:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DOMESTIC_TELEVISION_BLACK)
        case 2:
          return createBlock(PwBlockName.DOMESTIC_TELEVISION_GRAY)
        case 3:
          return createBlock(PwBlockName.DOMESTIC_TELEVISION_BLUE)
        case 0:
          return createBlock(PwBlockName.DOMESTIC_TELEVISION_YELLOW)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_WINDOW_BLACK:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DOMESTIC_WINDOW_BLACK)
        case 2:
          return createBlock(PwBlockName.DOMESTIC_WINDOW_BLUE)
        case 3:
          return createBlock(PwBlockName.DOMESTIC_WINDOW_ORANGE)
        case 0:
          return createBlock(PwBlockName.DOMESTIC_WINDOW_YELLOW)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_HALF_YELLOW_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.DOMESTIC_HALF_YELLOW_LEFT)
        case 3:
          return createBlock(PwBlockName.DOMESTIC_HALF_YELLOW_TOP)
        case 0:
          return createBlock(PwBlockName.DOMESTIC_HALF_YELLOW_RIGHT)
        case 1:
          return createBlock(PwBlockName.DOMESTIC_HALF_YELLOW_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_HALF_BROWN_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.DOMESTIC_HALF_BROWN_LEFT)
        case 3:
          return createBlock(PwBlockName.DOMESTIC_HALF_BROWN_TOP)
        case 0:
          return createBlock(PwBlockName.DOMESTIC_HALF_BROWN_RIGHT)
        case 1:
          return createBlock(PwBlockName.DOMESTIC_HALF_BROWN_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_HALF_WHITE_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.DOMESTIC_HALF_WHITE_LEFT)
        case 3:
          return createBlock(PwBlockName.DOMESTIC_HALF_WHITE_TOP)
        case 0:
          return createBlock(PwBlockName.DOMESTIC_HALF_WHITE_RIGHT)
        case 1:
          return createBlock(PwBlockName.DOMESTIC_HALF_WHITE_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOMESTIC_FRAME_BORDER_FULL:
      switch (eelvlBlock.intParameter) {
        case 5:
          return createBlock(PwBlockName.DOMESTIC_FRAME_BORDER_TOP_LEFT)
        case 1:
          return createBlock(PwBlockName.DOMESTIC_FRAME_BORDER_TOP)
        case 6:
          return createBlock(PwBlockName.DOMESTIC_FRAME_BORDER_TOP_RIGHT)
        case 9:
          return createBlock(PwBlockName.DOMESTIC_FRAME_BORDER_TOP_BOTTOM)
        case 4:
          return createBlock(PwBlockName.DOMESTIC_FRAME_BORDER_LEFT)
        case 0:
          return createBlock(PwBlockName.DOMESTIC_FRAME_BORDER_FULL)
        case 2:
          return createBlock(PwBlockName.DOMESTIC_FRAME_BORDER_RIGHT)
        case 10:
          return createBlock(PwBlockName.DOMESTIC_FRAME_BORDER_LEFT_RIGHT)
        case 8:
          return createBlock(PwBlockName.DOMESTIC_FRAME_BORDER_BOTTOM_LEFT)
        case 3:
          return createBlock(PwBlockName.DOMESTIC_FRAME_BORDER_BOTTOM)
        case 7:
          return createBlock(PwBlockName.DOMESTIC_FRAME_BORDER_BOTTOM_RIGHT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOJO_ROOFTOP_BLUE_LEFT:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DOJO_ROOFTOP_BLUE_LEFT)
        case 0:
          return createBlock(PwBlockName.DOJO_ROOFTOP_RED_LEFT)
        case 2:
          return createBlock(PwBlockName.DOJO_ROOFTOP_GREEN_LEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOJO_ROOFTOP_BLUE_RIGHT:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DOJO_ROOFTOP_BLUE_RIGHT)
        case 0:
          return createBlock(PwBlockName.DOJO_ROOFTOP_RED_RIGHT)
        case 2:
          return createBlock(PwBlockName.DOJO_ROOFTOP_GREEN_RIGHT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOJO_ROOFTOP_BLUE_DARK_LEFT:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.DOJO_ROOFTOP_GREEN_DARK_LEFT)
        case 1:
          return createBlock(PwBlockName.DOJO_ROOFTOP_BLUE_DARK_LEFT)
        case 0:
          return createBlock(PwBlockName.DOJO_ROOFTOP_RED_DARK_LEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DOJO_ROOFTOP_BLUE_DARK_RIGHT:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.DOJO_ROOFTOP_GREEN_DARK_RIGHT)
        case 1:
          return createBlock(PwBlockName.DOJO_ROOFTOP_BLUE_DARK_RIGHT)
        case 0:
          return createBlock(PwBlockName.DOJO_ROOFTOP_RED_DARK_RIGHT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }

    case EelvlBlockId.CHRISTMAS_STRING_LIGHT_TOP_RED:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.CHRISTMAS_STRING_LIGHT_TOP_RED)
        case 3:
          return createBlock(PwBlockName.CHRISTMAS_STRING_LIGHT_TOP_YELLOW)
        case 2:
          return createBlock(PwBlockName.CHRISTMAS_STRING_LIGHT_TOP_GREEN)
        case 4:
          return createBlock(PwBlockName.CHRISTMAS_STRING_LIGHT_TOP_BLUE)
        case 0:
          return createBlock(PwBlockName.CHRISTMAS_STRING_LIGHT_TOP_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.CHRISTMAS_STRING_LIGHT_BOTTOM_RED:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_RED)
        case 2:
          return createBlock(PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_YELLOW)
        case 3:
          return createBlock(PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_GREEN)
        case 4:
          return createBlock(PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_BLUE)
        case 0:
          return createBlock(PwBlockName.CHRISTMAS_STRING_LIGHT_BOTTOM_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SCIFI_LASER_BLUE_CORNER_BOTTOMRIGHT:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.SCIFI_LASER_BLUE_CORNER_BOTTOMRIGHT)
        case 2:
          return createBlock(PwBlockName.SCIFI_LASER_BLUE_CORNER_BOTTOMLEFT)
        case 0:
          return createBlock(PwBlockName.SCIFI_LASER_BLUE_CORNER_TOPRIGHT)
        case 3:
          return createBlock(PwBlockName.SCIFI_LASER_BLUE_CORNER_TOPLEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SCIFI_LASER_BLUE_STRAIGHT_VERTICAL:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.SCIFI_LASER_BLUE_STRAIGHT_HORIZONTAL)
        case 0:
          return createBlock(PwBlockName.SCIFI_LASER_BLUE_STRAIGHT_VERTICAL)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SCIFI_LASER_GREEN_CORNER_BOTTOMRIGHT:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.SCIFI_LASER_GREEN_CORNER_BOTTOMRIGHT)
        case 2:
          return createBlock(PwBlockName.SCIFI_LASER_GREEN_CORNER_BOTTOMLEFT)
        case 0:
          return createBlock(PwBlockName.SCIFI_LASER_GREEN_CORNER_TOPRIGHT)
        case 3:
          return createBlock(PwBlockName.SCIFI_LASER_GREEN_CORNER_TOPLEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SCIFI_LASER_GREEN_STRAIGHT_VERTICAL:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.SCIFI_LASER_GREEN_STRAIGHT_HORIZONTAL)
        case 0:
          return createBlock(PwBlockName.SCIFI_LASER_GREEN_STRAIGHT_VERTICAL)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SCIFI_LASER_ORANGE_CORNER_BOTTOMRIGHT:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.SCIFI_LASER_ORANGE_CORNER_BOTTOMRIGHT)
        case 2:
          return createBlock(PwBlockName.SCIFI_LASER_ORANGE_CORNER_BOTTOMLEFT)
        case 0:
          return createBlock(PwBlockName.SCIFI_LASER_ORANGE_CORNER_TOPRIGHT)
        case 3:
          return createBlock(PwBlockName.SCIFI_LASER_ORANGE_CORNER_TOPLEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SCIFI_LASER_ORANGE_STRAIGHT_VERITICAL:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.SCIFI_LASER_ORANGE_STRAIGHT_HORIZONTAL)
        case 0:
          return createBlock(PwBlockName.SCIFI_LASER_ORANGE_STRAIGHT_VERITICAL)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SCIFI_LASER_RED_CORNER_BOTTOMRIGHT:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.SCIFI_LASER_RED_CORNER_BOTTOMRIGHT)
        case 2:
          return createBlock(PwBlockName.SCIFI_LASER_RED_CORNER_BOTTOMLEFT)
        case 0:
          return createBlock(PwBlockName.SCIFI_LASER_RED_CORNER_TOPRIGHT)
        case 3:
          return createBlock(PwBlockName.SCIFI_LASER_RED_CORNER_TOPLEFT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SCIFI_LASER_RED_STRAIGHT_VERTICAL:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.SCIFI_LASER_RED_STRAIGHT_HORIZONTAL)
        case 0:
          return createBlock(PwBlockName.SCIFI_LASER_RED_STRAIGHT_VERTICAL)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALFBLOCKS_WHITE_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.HALFBLOCKS_WHITE_LEFT)
        case 3:
          return createBlock(PwBlockName.HALFBLOCKS_WHITE_TOP)
        case 0:
          return createBlock(PwBlockName.HALFBLOCKS_WHITE_RIGHT)
        case 1:
          return createBlock(PwBlockName.HALFBLOCKS_WHITE_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALFBLOCKS_GRAY_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.HALFBLOCKS_GRAY_LEFT)
        case 3:
          return createBlock(PwBlockName.HALFBLOCKS_GRAY_TOP)
        case 0:
          return createBlock(PwBlockName.HALFBLOCKS_GRAY_RIGHT)
        case 1:
          return createBlock(PwBlockName.HALFBLOCKS_GRAY_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALFBLOCKS_BLACK_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.HALFBLOCKS_BLACK_LEFT)
        case 3:
          return createBlock(PwBlockName.HALFBLOCKS_BLACK_TOP)
        case 0:
          return createBlock(PwBlockName.HALFBLOCKS_BLACK_RIGHT)
        case 1:
          return createBlock(PwBlockName.HALFBLOCKS_BLACK_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALFBLOCKS_RED_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.HALFBLOCKS_RED_LEFT)
        case 3:
          return createBlock(PwBlockName.HALFBLOCKS_RED_TOP)
        case 0:
          return createBlock(PwBlockName.HALFBLOCKS_RED_RIGHT)
        case 1:
          return createBlock(PwBlockName.HALFBLOCKS_RED_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALFBLOCKS_ORANGE_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.HALFBLOCKS_ORANGE_LEFT)
        case 3:
          return createBlock(PwBlockName.HALFBLOCKS_ORANGE_TOP)
        case 0:
          return createBlock(PwBlockName.HALFBLOCKS_ORANGE_RIGHT)
        case 1:
          return createBlock(PwBlockName.HALFBLOCKS_ORANGE_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALFBLOCKS_YELLOW_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.HALFBLOCKS_YELLOW_LEFT)
        case 3:
          return createBlock(PwBlockName.HALFBLOCKS_YELLOW_TOP)
        case 0:
          return createBlock(PwBlockName.HALFBLOCKS_YELLOW_RIGHT)
        case 1:
          return createBlock(PwBlockName.HALFBLOCKS_YELLOW_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALFBLOCKS_GREEN_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.HALFBLOCKS_GREEN_LEFT)
        case 3:
          return createBlock(PwBlockName.HALFBLOCKS_GREEN_TOP)
        case 0:
          return createBlock(PwBlockName.HALFBLOCKS_GREEN_RIGHT)
        case 1:
          return createBlock(PwBlockName.HALFBLOCKS_GREEN_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALFBLOCKS_CYAN_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.HALFBLOCKS_CYAN_LEFT)
        case 3:
          return createBlock(PwBlockName.HALFBLOCKS_CYAN_TOP)
        case 0:
          return createBlock(PwBlockName.HALFBLOCKS_CYAN_RIGHT)
        case 1:
          return createBlock(PwBlockName.HALFBLOCKS_CYAN_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALFBLOCKS_BLUE_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.HALFBLOCKS_BLUE_LEFT)
        case 3:
          return createBlock(PwBlockName.HALFBLOCKS_BLUE_TOP)
        case 0:
          return createBlock(PwBlockName.HALFBLOCKS_BLUE_RIGHT)
        case 1:
          return createBlock(PwBlockName.HALFBLOCKS_BLUE_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HALFBLOCKS_MAGENTA_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.HALFBLOCKS_MAGENTA_LEFT)
        case 3:
          return createBlock(PwBlockName.HALFBLOCKS_MAGENTA_TOP)
        case 0:
          return createBlock(PwBlockName.HALFBLOCKS_MAGENTA_RIGHT)
        case 1:
          return createBlock(PwBlockName.HALFBLOCKS_MAGENTA_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.WINTER_HALF_SNOW_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.WINTER_HALF_SNOW_LEFT)
        case 3:
          return createBlock(PwBlockName.WINTER_HALF_SNOW_TOP)
        case 0:
          return createBlock(PwBlockName.WINTER_HALF_SNOW_RIGHT)
        case 1:
          return createBlock(PwBlockName.WINTER_HALF_SNOW_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.WINTER_HALF_ICE_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.WINTER_HALF_ICE_LEFT)
        case 3:
          return createBlock(PwBlockName.WINTER_HALF_ICE_TOP)
        case 0:
          return createBlock(PwBlockName.WINTER_HALF_ICE_RIGHT)
        case 1:
          return createBlock(PwBlockName.WINTER_HALF_ICE_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.FAIRYTALE_HALF_ORANGE_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.FAIRYTALE_HALF_ORANGE_LEFT)
        case 3:
          return createBlock(PwBlockName.FAIRYTALE_HALF_ORANGE_TOP)
        case 0:
          return createBlock(PwBlockName.FAIRYTALE_HALF_ORANGE_RIGHT)
        case 1:
          return createBlock(PwBlockName.FAIRYTALE_HALF_ORANGE_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.FAIRYTALE_HALF_GREEN_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.FAIRYTALE_HALF_GREEN_LEFT)
        case 3:
          return createBlock(PwBlockName.FAIRYTALE_HALF_GREEN_TOP)
        case 0:
          return createBlock(PwBlockName.FAIRYTALE_HALF_GREEN_RIGHT)
        case 1:
          return createBlock(PwBlockName.FAIRYTALE_HALF_GREEN_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.FAIRYTALE_HALF_BLUE_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.FAIRYTALE_HALF_BLUE_LEFT)
        case 3:
          return createBlock(PwBlockName.FAIRYTALE_HALF_BLUE_TOP)
        case 0:
          return createBlock(PwBlockName.FAIRYTALE_HALF_BLUE_RIGHT)
        case 1:
          return createBlock(PwBlockName.FAIRYTALE_HALF_BLUE_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.FAIRYTALE_HALF_PINK_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.FAIRYTALE_HALF_PINK_LEFT)
        case 3:
          return createBlock(PwBlockName.FAIRYTALE_HALF_PINK_TOP)
        case 0:
          return createBlock(PwBlockName.FAIRYTALE_HALF_PINK_RIGHT)
        case 1:
          return createBlock(PwBlockName.FAIRYTALE_HALF_PINK_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.FAIRYTALE_FLOWER_BLUE:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.FAIRYTALE_FLOWER_BLUE)
        case 2:
          return createBlock(PwBlockName.FAIRYTALE_FLOWER_ORANGE)
        case 0:
          return createBlock(PwBlockName.FAIRYTALE_FLOWER_PINK)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SPRING_DAISY_WHITE:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.SPRING_DAISY_WHITE)
        case 2:
          return createBlock(PwBlockName.SPRING_DAISY_BLUE)
        case 0:
          return createBlock(PwBlockName.SPRING_DAISY_PINK)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SPRING_TULIP_RED:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.SPRING_TULIP_RED)
        case 2:
          return createBlock(PwBlockName.SPRING_TULIP_YELLOW)
        case 0:
          return createBlock(PwBlockName.SPRING_TULIP_PINK)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SPRING_DAFFODIL_YELLOW:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.SPRING_DAFFODIL_WHITE)
        case 1:
          return createBlock(PwBlockName.SPRING_DAFFODIL_YELLOW)
        case 0:
          return createBlock(PwBlockName.SPRING_DAFFODIL_ORANGE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.ONEWAY_WHITE_TOP:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.ONEWAY_WHITE_LEFT)
        case 1:
          return createBlock(PwBlockName.ONEWAY_WHITE_TOP)
        case 2:
          return createBlock(PwBlockName.ONEWAY_WHITE_RIGHT)
        case 3:
          return createBlock(PwBlockName.ONEWAY_WHITE_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.ONEWAY_GRAY_TOP:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.ONEWAY_GRAY_LEFT)
        case 1:
          return createBlock(PwBlockName.ONEWAY_GRAY_TOP)
        case 2:
          return createBlock(PwBlockName.ONEWAY_GRAY_RIGHT)
        case 3:
          return createBlock(PwBlockName.ONEWAY_GRAY_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.ONEWAY_BLACK_TOP:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.ONEWAY_BLACK_LEFT)
        case 1:
          return createBlock(PwBlockName.ONEWAY_BLACK_TOP)
        case 2:
          return createBlock(PwBlockName.ONEWAY_BLACK_RIGHT)
        case 3:
          return createBlock(PwBlockName.ONEWAY_BLACK_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.ONEWAY_RED_TOP:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.ONEWAY_RED_LEFT)
        case 1:
          return createBlock(PwBlockName.ONEWAY_RED_TOP)
        case 2:
          return createBlock(PwBlockName.ONEWAY_RED_RIGHT)
        case 3:
          return createBlock(PwBlockName.ONEWAY_RED_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.ONEWAY_ORANGE_TOP:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.ONEWAY_ORANGE_LEFT)
        case 1:
          return createBlock(PwBlockName.ONEWAY_ORANGE_TOP)
        case 2:
          return createBlock(PwBlockName.ONEWAY_ORANGE_RIGHT)
        case 3:
          return createBlock(PwBlockName.ONEWAY_ORANGE_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.ONEWAY_YELLOW_TOP:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.ONEWAY_YELLOW_LEFT)
        case 1:
          return createBlock(PwBlockName.ONEWAY_YELLOW_TOP)
        case 2:
          return createBlock(PwBlockName.ONEWAY_YELLOW_RIGHT)
        case 3:
          return createBlock(PwBlockName.ONEWAY_YELLOW_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.ONEWAY_GREEN_TOP:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.ONEWAY_GREEN_LEFT)
        case 1:
          return createBlock(PwBlockName.ONEWAY_GREEN_TOP)
        case 2:
          return createBlock(PwBlockName.ONEWAY_GREEN_RIGHT)
        case 3:
          return createBlock(PwBlockName.ONEWAY_GREEN_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.ONEWAY_CYAN_TOP:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.ONEWAY_CYAN_LEFT)
        case 1:
          return createBlock(PwBlockName.ONEWAY_CYAN_TOP)
        case 2:
          return createBlock(PwBlockName.ONEWAY_CYAN_RIGHT)
        case 3:
          return createBlock(PwBlockName.ONEWAY_CYAN_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.ONEWAY_BLUE_TOP:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.ONEWAY_BLUE_LEFT)
        case 1:
          return createBlock(PwBlockName.ONEWAY_BLUE_TOP)
        case 2:
          return createBlock(PwBlockName.ONEWAY_BLUE_RIGHT)
        case 3:
          return createBlock(PwBlockName.ONEWAY_BLUE_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.ONEWAY_MAGENTA_TOP:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.ONEWAY_MAGENTA_LEFT)
        case 1:
          return createBlock(PwBlockName.ONEWAY_MAGENTA_TOP)
        case 2:
          return createBlock(PwBlockName.ONEWAY_MAGENTA_RIGHT)
        case 3:
          return createBlock(PwBlockName.ONEWAY_MAGENTA_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DUNGEON_PILLAR_MIDDLE_GRAY:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DUNGEON_PILLAR_MIDDLE_GRAY)
        case 2:
          return createBlock(PwBlockName.DUNGEON_PILLAR_MIDDLE_GREEN)
        case 3:
          return createBlock(PwBlockName.DUNGEON_PILLAR_MIDDLE_BLUE)
        case 0:
          return createBlock(PwBlockName.DUNGEON_PILLAR_MIDDLE_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.DUNGEON_PILLAR_BOTTOM_GRAY:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DUNGEON_PILLAR_BOTTOM_GRAY)
        case 2:
          return createBlock(PwBlockName.DUNGEON_PILLAR_BOTTOM_GREEN)
        case 3:
          return createBlock(PwBlockName.DUNGEON_PILLAR_BOTTOM_BLUE)
        case 0:
          return createBlock(PwBlockName.DUNGEON_PILLAR_BOTTOM_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }

    case EelvlBlockId.DUNGEON_ONEWAY_PILLAR_TOP_GRAY:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DUNGEON_ONEWAY_PILLAR_TOP_GRAY)
        case 2:
          return createBlock(PwBlockName.DUNGEON_ONEWAY_PILLAR_TOP_GREEN)
        case 3:
          return createBlock(PwBlockName.DUNGEON_ONEWAY_PILLAR_TOP_BLUE)
        case 0:
          return createBlock(PwBlockName.DUNGEON_ONEWAY_PILLAR_TOP_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }

    case EelvlBlockId.DUNGEON_STEEL_ARC_LEFT_GRAY:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DUNGEON_STEEL_ARC_LEFT_GRAY)
        case 2:
          return createBlock(PwBlockName.DUNGEON_STEEL_ARC_LEFT_GREEN)
        case 3:
          return createBlock(PwBlockName.DUNGEON_STEEL_ARC_LEFT_BLUE)
        case 0:
          return createBlock(PwBlockName.DUNGEON_STEEL_ARC_LEFT_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }

    case EelvlBlockId.DUNGEON_PILLAR_ARC_RIGHT_GRAY:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DUNGEON_PILLAR_ARC_RIGHT_GRAY)
        case 2:
          return createBlock(PwBlockName.DUNGEON_PILLAR_ARC_RIGHT_GREEN)
        case 3:
          return createBlock(PwBlockName.DUNGEON_PILLAR_ARC_RIGHT_BLUE)
        case 0:
          return createBlock(PwBlockName.DUNGEON_PILLAR_ARC_RIGHT_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }

    case EelvlBlockId.DUNGEON_TORCH_YELLOW:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.DUNGEON_TORCH_YELLOW)
        case 3:
          return createBlock(PwBlockName.DUNGEON_TORCH_GREEN)
        case 2:
          return createBlock(PwBlockName.DUNGEON_TORCH_BLUE)
        case 0:
          return createBlock(PwBlockName.DUNGEON_TORCH_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.RETAIL_FLAG_RED:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.RETAIL_FLAG_RED)
        case 3:
          return createBlock(PwBlockName.RETAIL_FLAG_GREEN)
        case 2:
          return createBlock(PwBlockName.RETAIL_FLAG_YELLOW)
        case 4:
          return createBlock(PwBlockName.RETAIL_FLAG_CYAN)
        case 5:
          return createBlock(PwBlockName.RETAIL_FLAG_BLUE)
        case 0:
          return createBlock(PwBlockName.RETAIL_FLAG_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.RETAIL_AWNING_RED:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.RETAIL_AWNING_RED)
        case 3:
          return createBlock(PwBlockName.RETAIL_AWNING_GREEN)
        case 2:
          return createBlock(PwBlockName.RETAIL_AWNING_YELLOW)
        case 4:
          return createBlock(PwBlockName.RETAIL_AWNING_CYAN)
        case 5:
          return createBlock(PwBlockName.RETAIL_AWNING_BLUE)
        case 0:
          return createBlock(PwBlockName.RETAIL_AWNING_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.SUMMER_ICE_CREAM_VANILLA:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.SUMMER_ICE_CREAM_VANILLA)
        case 2:
          return createBlock(PwBlockName.SUMMER_ICE_CREAM_CHOCOLATE)
        case 3:
          return createBlock(PwBlockName.SUMMER_ICE_CREAM_SRAWBERRY)
        case 0:
          return createBlock(PwBlockName.SUMMER_ICE_CREAM_MINT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.MINE_CRYSTAL_RED:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.MINE_CRYSTAL_RED)
        case 3:
          return createBlock(PwBlockName.MINE_CRYSTAL_GREEN)
        case 2:
          return createBlock(PwBlockName.MINE_CRYSTAL_YELLOW)
        case 4:
          return createBlock(PwBlockName.MINE_CRYSTAL_CYAN)
        case 5:
          return createBlock(PwBlockName.MINE_CRYSTAL_BLUE)
        case 0:
          return createBlock(PwBlockName.MINE_CRYSTAL_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HAUNTED_WINDOW_CURVED_OFF:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.HAUNTED_WINDOW_CURVED_OFF)
        case 0:
          return createBlock(PwBlockName.HAUNTED_WINDOW_CURVED_ON)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HAUNTED_WINDOW_CIRCLE_OFF:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.HAUNTED_WINDOW_CIRCLE_OFF)
        case 0:
          return createBlock(PwBlockName.HAUNTED_WINDOW_CIRCLE_ON)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.HAUNTED_LANTERN_OFF:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.HAUNTED_LANTERN_OFF)
        case 0:
          return createBlock(PwBlockName.HAUNTED_LANTERN_ON)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.MONSTER_TEETH_LARGE_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 3:
          return createBlock(PwBlockName.MONSTER_TEETH_LARGE_TOP)
        case 1:
          return createBlock(PwBlockName.MONSTER_TEETH_LARGE_BOTTOM)
        case 2:
          return createBlock(PwBlockName.MONSTER_TEETH_LARGE_LEFT)
        case 0:
          return createBlock(PwBlockName.MONSTER_TEETH_LARGE_RIGHT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.MONSTER_TEETH_MEDIUM_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 3:
          return createBlock(PwBlockName.MONSTER_TEETH_MEDIUM_TOP)
        case 1:
          return createBlock(PwBlockName.MONSTER_TEETH_MEDIUM_BOTTOM)
        case 2:
          return createBlock(PwBlockName.MONSTER_TEETH_MEDIUM_LEFT)
        case 0:
          return createBlock(PwBlockName.MONSTER_TEETH_MEDIUM_RIGHT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.MONSTER_TEETH_SMALL_BOTTOM:
      switch (eelvlBlock.intParameter) {
        case 3:
          return createBlock(PwBlockName.MONSTER_TEETH_SMALL_TOP)
        case 1:
          return createBlock(PwBlockName.MONSTER_TEETH_SMALL_BOTTOM)
        case 2:
          return createBlock(PwBlockName.MONSTER_TEETH_SMALL_LEFT)
        case 0:
          return createBlock(PwBlockName.MONSTER_TEETH_SMALL_RIGHT)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.NEWYEARS_BALLOON_ORANGE:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.NEWYEARS_BALLOON_RED)
        case 1:
          return createBlock(PwBlockName.NEWYEARS_BALLOON_ORANGE)
        case 0:
          return createBlock(PwBlockName.NEWYEARS_BALLOON_GREEN)
        case 4:
          return createBlock(PwBlockName.NEWYEARS_BALLOON_BLUE)
        case 3:
          return createBlock(PwBlockName.NEWYEARS_BALLOON_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.NEWYEARS_STREAMER_ORANGE:
      switch (eelvlBlock.intParameter) {
        case 2:
          return createBlock(PwBlockName.NEWYEARS_STREAMER_RED)
        case 1:
          return createBlock(PwBlockName.NEWYEARS_STREAMER_ORANGE)
        case 0:
          return createBlock(PwBlockName.NEWYEARS_STREAMER_GREEN)
        case 4:
          return createBlock(PwBlockName.NEWYEARS_STREAMER_BLUE)
        case 3:
          return createBlock(PwBlockName.NEWYEARS_STREAMER_PURPLE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.RESTAURANT_GLASS_EMPTY:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.RESTAURANT_GLASS_EMPTY)
        case 2:
          return createBlock(PwBlockName.RESTAURANT_GLASS_WATER)
        case 3:
          return createBlock(PwBlockName.RESTAURANT_GLASS_MILK)
        case 0:
          return createBlock(PwBlockName.RESTAURANT_GLASS_ORANGEJUICE)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.RESTAURANT_PLATE_EMPTY:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.RESTAURANT_PLATE_EMPTY)
        case 2:
          return createBlock(PwBlockName.RESTAURANT_PLATE_CHICKEN)
        case 3:
          return createBlock(PwBlockName.RESTAURANT_PLATE_HAM)
        case 4:
          return createBlock(PwBlockName.RESTAURANT_PLATE_FISH)
        case 0:
          return createBlock(PwBlockName.RESTAURANT_PLATE_COOKIES)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.RESTAURANT_BOWL_EMPTY:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.RESTAURANT_BOWL_EMPTY)
        case 3:
          return createBlock(PwBlockName.RESTAURANT_BOWL_SALAD)
        case 2:
          return createBlock(PwBlockName.RESTAURANT_BOWL_SPAGHETTI)
        case 0:
          return createBlock(PwBlockName.RESTAURANT_BOWL_ICECREAM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.TOXIC_ONEWAY_RUSTED_TOP:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.TOXIC_ONEWAY_RUSTED_LEFT)
        case 1:
          return createBlock(PwBlockName.TOXIC_ONEWAY_RUSTED_TOP)
        case 2:
          return createBlock(PwBlockName.TOXIC_ONEWAY_RUSTED_RIGHT)
        case 3:
          return createBlock(PwBlockName.TOXIC_ONEWAY_RUSTED_BOTTOM)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.TOXIC_WASTE_BARREL_OFF:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.TOXIC_WASTE_BARREL_OFF)
        case 0:
          return createBlock(PwBlockName.TOXIC_WASTE_BARREL_ON)
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.TOXIC_SEWER_DRAIN_EMPTY:
      switch (eelvlBlock.intParameter) {
        case 1:
          return createBlock(PwBlockName.TOXIC_SEWER_DRAIN_EMPTY)
        case 2:
          return createBlock(PwBlockName.TOXIC_SEWER_DRAIN_WATER)
        case 0:
          return createBlock(PwBlockName.TOXIC_SEWER_DRAIN_WASTE)
        case 3:
          return createBlock(PwBlockName.TOXIC_SEWER_DRAIN_LAVA)
        case 4:
          return createBlock(PwBlockName.TOXIC_SEWER_DRAIN_MUD)
        default:
          return createBlock(PwBlockName.EMPTY)
      }

    // EBE LOGIC

    // Counters
    case EelvlBlockId.EBE_COUNTER_CONSUMABLE:
        switch (eelvlBlock.intParameter) {
          case 0:
            return createBlock(PwBlockName.COUNTER_WHITE_CONSUMABLE, [eelvlBlock.intParameterTwo!])
          case 1:
            return createBlock(PwBlockName.COUNTER_BLACK_CONSUMABLE, [eelvlBlock.intParameterTwo!])
          case 2:
            return createBlock(PwBlockName.COUNTER_RED_CONSUMABLE, [eelvlBlock.intParameterTwo!])
          case 3:
            return createBlock(PwBlockName.COUNTER_GREEN_CONSUMABLE, [eelvlBlock.intParameterTwo!])
          case 4:
            return createBlock(PwBlockName.COUNTER_BLUE_CONSUMABLE, [eelvlBlock.intParameterTwo!])
          case 5:
            return createBlock(PwBlockName.COUNTER_CYAN_CONSUMABLE, [eelvlBlock.intParameterTwo!])
          case 6:
            return createBlock(PwBlockName.COUNTER_MAGENTA_CONSUMABLE, [eelvlBlock.intParameterTwo!])
          case 7:
            return createBlock(PwBlockName.COUNTER_YELLOW_CONSUMABLE, [eelvlBlock.intParameterTwo!])
          default:
            return createBlock(PwBlockName.EMPTY)
        }

    case EelvlBlockId.EBE_COUNTER_REUSABLE:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.COUNTER_WHITE_REUSABLE, [eelvlBlock.intParameterTwo!])
        case 1:
          return createBlock(PwBlockName.COUNTER_BLACK_REUSABLE, [eelvlBlock.intParameterTwo!])
        case 2:
          return createBlock(PwBlockName.COUNTER_RED_REUSABLE, [eelvlBlock.intParameterTwo!])
        case 3:
          return createBlock(PwBlockName.COUNTER_GREEN_REUSABLE, [eelvlBlock.intParameterTwo!])
        case 4:
          return createBlock(PwBlockName.COUNTER_BLUE_REUSABLE, [eelvlBlock.intParameterTwo!])
        case 5:
          return createBlock(PwBlockName.COUNTER_CYAN_REUSABLE, [eelvlBlock.intParameterTwo!])
        case 6:
          return createBlock(PwBlockName.COUNTER_MAGENTA_REUSABLE, [eelvlBlock.intParameterTwo!])
        case 7:
          return createBlock(PwBlockName.COUNTER_YELLOW_REUSABLE, [eelvlBlock.intParameterTwo!])
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.EBE_COUNTER_DOOR:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.COUNTER_WHITE_DOOR, [eelvlBlock.intParameterTwo!])
        case 1:
          return createBlock(PwBlockName.COUNTER_BLACK_DOOR, [eelvlBlock.intParameterTwo!])
        case 2:
          return createBlock(PwBlockName.COUNTER_RED_DOOR, [eelvlBlock.intParameterTwo!])
        case 3:
          return createBlock(PwBlockName.COUNTER_GREEN_DOOR, [eelvlBlock.intParameterTwo!])
        case 4:
          return createBlock(PwBlockName.COUNTER_BLUE_DOOR, [eelvlBlock.intParameterTwo!])
        case 5:
          return createBlock(PwBlockName.COUNTER_CYAN_DOOR, [eelvlBlock.intParameterTwo!])
        case 6:
          return createBlock(PwBlockName.COUNTER_MAGENTA_DOOR, [eelvlBlock.intParameterTwo!])
        case 7:
          return createBlock(PwBlockName.COUNTER_YELLOW_DOOR, [eelvlBlock.intParameterTwo!])
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.EBE_COUNTER_GATE:
      switch (eelvlBlock.intParameter) {
        case 0:
          return createBlock(PwBlockName.COUNTER_WHITE_GATE, [eelvlBlock.intParameterTwo!])
        case 1:
          return createBlock(PwBlockName.COUNTER_BLACK_GATE, [eelvlBlock.intParameterTwo!])
        case 2:
          return createBlock(PwBlockName.COUNTER_RED_GATE, [eelvlBlock.intParameterTwo!])
        case 3:
          return createBlock(PwBlockName.COUNTER_GREEN_GATE, [eelvlBlock.intParameterTwo!])
        case 4:
          return createBlock(PwBlockName.COUNTER_BLUE_GATE, [eelvlBlock.intParameterTwo!])
        case 5:
          return createBlock(PwBlockName.COUNTER_CYAN_GATE, [eelvlBlock.intParameterTwo!])
        case 6:
          return createBlock(PwBlockName.COUNTER_MAGENTA_GATE, [eelvlBlock.intParameterTwo!])
        case 7:
          return createBlock(PwBlockName.COUNTER_YELLOW_GATE, [eelvlBlock.intParameterTwo!])
        default:
          return createBlock(PwBlockName.EMPTY)
      }
    case EelvlBlockId.EBE_HEX_BG_SOLID:
      return createBlock(PwBlockName.CUSTOM_SOLID_BG, [eelvlBlock.uintParameter!])
    case EelvlBlockId.EBE_HEX_BG_CHECKER:
      return createBlock(PwBlockName.CUSTOM_CHECKER_BG, [eelvlBlock.uintParameter!])
    default:
      const eelvlBlockName = EelvlBlockId[eelvlBlock.blockId]
      if (eelvlBlockName === undefined) {
        return createMissingBlockSign(`Unknown Block ID: ${eelvlBlock.blockId}`)
      }
      const pwBlockName: PwBlockName = PwBlockName[eelvlBlockName as keyof typeof PwBlockName]
      if (pwBlockName === undefined) {
        return createMissingBlockSign(`Missing PixelWalker block: ${eelvlBlockName}`)
      }

      return createBlock(pwBlockName)
  }
}

function createMissingBlockSign(message: string): Block {
  return createBlock(PwBlockName.SIGN_NORMAL, [message])
}

function getEelvlToPwEffectsJumpHeightBlock(eelvlBlock: EelvlBlock): Block {
  const jumpHeight = eelvlBlock.intParameter
  switch (jumpHeight) {
    case 2:
      return createBlock(PwBlockName.EFFECTS_JUMP_HEIGHT, [2])
    case 0:
      return createBlock(PwBlockName.EFFECTS_JUMP_HEIGHT, [3])
    case 1:
      return createBlock(PwBlockName.EFFECTS_JUMP_HEIGHT, [6])
    default:
      return createBlock(PwBlockName.EMPTY)
  }
}

function getEelvlToPwEffectsSpeedBlock(eelvlBlock: EelvlBlock): Block {
  const speed = eelvlBlock.intParameter
  switch (speed) {
    case 2:
      return createBlock(PwBlockName.EFFECTS_SPEED, [60])
    case 0:
      return createBlock(PwBlockName.EFFECTS_SPEED, [100])
    case 1:
      return createBlock(PwBlockName.EFFECTS_SPEED, [150])
    default:
      return createBlock(PwBlockName.EMPTY)
  }
}

function getEelvlToPwEffectsGravityForceBlock(eelvlBlock: EelvlBlock): Block {
  const gravityForce = eelvlBlock.intParameter
  switch (gravityForce) {
    case 1:
      return createBlock(PwBlockName.EFFECTS_GRAVITYFORCE, [15])
    case 0:
      return createBlock(PwBlockName.EFFECTS_GRAVITYFORCE, [100])
    default:
      return createBlock(PwBlockName.EMPTY)
  }
}

function getEelvlToPwEffectsMultiJumpBlock(eelvlBlock: EelvlBlock): Block {
  let jumpCount = eelvlBlock.intParameter!
  if (jumpCount === 1000) {
    jumpCount = -1 // PW uses -1 as infinite jumps
  }
  return createBlock(PwBlockName.EFFECTS_MULTI_JUMP, [jumpCount])
}

function getEelvlToPwPortalBlock(eelvlBlock: EelvlBlock, pwBlockName: PwBlockName): Block {
  let rotation = eelvlBlock.intParameter!
  const portalId = eelvlBlock.portalId!
  const portalTarget = eelvlBlock.portalTarget!
  switch (rotation) {
    case 1:
      rotation = 0
      break
    case 2:
      rotation = 1
      break
    case 3:
      rotation = 2
      break
    case 0:
      rotation = 3
      break
  }
  return createBlock(pwBlockName, [rotation, portalId, portalTarget])
}

function getEelvlToPwNoteBlock(eelvlBlock: EelvlBlock, pwBlockName: PwBlockName): Block {
  const noteArray = new Uint8Array(1)
  noteArray[0] = eelvlBlock.intParameter as number
  return createBlock(pwBlockName, [noteArray as Buffer])
}

function getEelvlToPwSwitchActivatorBlock(eelvlBlock: EelvlBlock, pwBlockName: PwBlockName): Block {
  return createBlock(pwBlockName, [eelvlBlock.intParameter!, 0])
}
