import { defineComponent, onBeforeMount, ref } from 'vue'
import { usePWClientStore } from '@/stores/PWClient.ts'
import { LoginRoute } from '@/router/routes.ts'
import { useRouter } from 'vue-router'
import { BlockNames, PWApiClient, PWGameClient } from 'pw-js-api'
import { PlayerChatPacket, WorldBlockPlacedPacket } from 'pw-js-api/dist/gen/world_pb'
import { cloneDeep } from 'lodash-es'
import { Block, IPlayer, LayerType, PWGameWorldHelper } from 'pw-js-world'
import { equals } from 'uint8arrays/equals'
import { Point, SendableBlockPacket } from 'pw-js-world/dist/types'

export default defineComponent({
  setup() {
    const loading = { loading: ref(false) }

    const PWClientStore = usePWClientStore()
    const router = useRouter()

    const pwGameWorldHelper = new PWGameWorldHelper()

    const getPwGameClient = (): PWGameClient => {
      return PWClientStore.pwGameClient!
    }
    const getPwApiClient = (): PWApiClient => {
      return PWClientStore.pwApiClient!
    }
    const getPwGameWorldHelper = (): PWGameWorldHelper => {
      return pwGameWorldHelper
    }

    enum BotState {
      NONE = 0,
      SELECTED_FROM = 1,
      SELECTED_TO = 2,
    }

    type BlockInfo = {
      x: number
      y: number
      layer: LayerType
      block: Block
    }

    type BotData = {
      botState: BotState
      selectedFromPos: Point
      selectedToPos: Point
      selectedAreaData: BlockInfo[]
    }

    function createBotData(): BotData {
      return {
        botState: BotState.NONE,
        selectedFromPos: { x: 0, y: 0 },
        selectedToPos: { x: 0, y: 0 },
        selectedAreaData: [],
      }
    }

    // TODO: periodically remove entries for players who left world (though it takes little data)
    // Stores copy/paste data for each player independently
    let playerBotData: { [playerId: number]: BotData } = {}

    onBeforeMount(async () => {
      sendChatMessage("Copy Bot joined the world!")
      getPwGameClient()
        .addHook(getPwGameWorldHelper().receiveHook)
        .addCallback('playerChatPacket', playerChatPacketReceived)
        .addCallback('worldBlockPlacedPacket', worldBlockPlacedPacketReceived)
    })

    function playerChatPacketReceived(data: PlayerChatPacket) {
      const args = data.message.split(' ')

      switch (args[0].toLowerCase()) {
        case '.ping':
          sendChatMessage("pong")
          break
        case '.help':
          sendChatMessage("Bot usage:")
          sendChatMessage("Gold coin - select blocks")
          sendChatMessage("Blue coin - paste blocks")
          sendChatMessage("Commands:")
          sendChatMessage(".ping - pong")
          sendChatMessage(".help - print usage and commands")
          break
      }
    }

    function worldBlockPlacedPacketReceived(
      data: WorldBlockPlacedPacket,
      states?: { player: IPlayer | undefined; oldBlocks: Block[]; newBlocks: Block[] },
    ) {
      if (data.playerId === PWClientStore.selfPlayerId) {
        return
      }

      if (states === undefined) {
        return
      }

      const playerId = data.playerId
      if (playerId === undefined) {
        return
      }

      if (!playerBotData[playerId]) {
        playerBotData[playerId] = createBotData()
      }
      const botData = playerBotData[playerId]
      const blockPos = data.positions[0]

      if (data.blockId === BlockNames.COIN_GOLD) {
        const oldBlock = states.oldBlocks[0]
        const blockPacket = getPwGameWorldHelper().createBlockPacket(oldBlock, LayerType.Foreground, blockPos)

        placeBlock(blockPacket)

        let selectedTypeText: string
        if ([BotState.NONE, BotState.SELECTED_TO].includes(botData.botState)) {
          selectedTypeText = 'from'
          botData.botState = BotState.SELECTED_FROM
          botData.selectedFromPos = blockPos
        } else {
          selectedTypeText = 'to'
          botData.botState = BotState.SELECTED_TO
          botData.selectedToPos = blockPos

          botData.selectedAreaData = getSelectedAreaCopy(oldBlock, botData)
        }

        sendChatMessage(`Selected ${selectedTypeText} x: ${blockPos.x} y: ${blockPos.y}`)
      }

      if (data.blockId === BlockNames.COIN_BLUE) {
        placeMultipleBlocks(blockPos, botData.selectedAreaData)
      }
    }

    function getSelectedAreaCopy(oldBlock: Block, botData: BotData) {
      const { selectedFromPos, selectedToPos } = botData
      let data: BlockInfo[] = []
      const dirX = selectedFromPos.x <= selectedToPos.x ? 1 : -1
      const dirY = selectedFromPos.y <= selectedToPos.y ? 1 : -1
      for (let x = 0; x <= Math.abs(selectedFromPos.x - selectedToPos.x); x++) {
        for (let y = 0; y <= Math.abs(selectedFromPos.y - selectedToPos.y); y++) {
          const sourcePosX = selectedFromPos.x + x * dirX
          const sourcePosY = selectedFromPos.y + y * dirY
          const dataPosX = x * dirX
          const dataPosY = y * dirY

          let foregroundBlock = getPwGameWorldHelper().getBlockAt(sourcePosX, sourcePosY, LayerType.Foreground)
          if (sourcePosX === selectedToPos.x && sourcePosY === selectedToPos.y) {
            foregroundBlock = oldBlock
          }

          data.push({
            block: foregroundBlock,
            x: dataPosX,
            y: dataPosY,
            layer: LayerType.Foreground,
          })
          data.push({
            block: getPwGameWorldHelper().getBlockAt(sourcePosX, sourcePosY, LayerType.Background),
            x: dataPosX,
            y: dataPosY,
            layer: LayerType.Background,
          })
        }
      }
      return data
    }

    function placeBlock(blockPacket: SendableBlockPacket) {
      getPwGameClient().send('worldBlockPlacedPacket', blockPacket)
    }

    function placeMultipleBlocks(offsetPos: Point, blockData: BlockInfo[]) {
      let blocks = cloneDeep(blockData)

      // TODO: move this to pw-js-world
      const packets: SendableBlockPacket[] = []
      for (const block of blocks) {
        let found = false
        const placePos = {
          x: block.x + offsetPos.x,
          y: block.y + offsetPos.y,
        }
        const blockPacket: SendableBlockPacket = getPwGameWorldHelper().createBlockPacket(
          block.block,
          block.layer,
          placePos,
        )
        for (const packet of packets) {
          const MAX_WORLD_BLOCK_PLACED_PACKET_POSITION_SIZE = 200
          if (packet.positions.length >= MAX_WORLD_BLOCK_PLACED_PACKET_POSITION_SIZE) {
            continue
          }
          if (packet.blockId !== block.block.bId) {
            continue
          }
          if (packet.layer !== block.layer) {
            continue
          }
          if (!equals(packet.extraFields!, blockPacket.extraFields!)) {
            continue
          }
          // TODO: filter identical positions
          packet.positions.push(placePos)
          found = true
        }
        if (!found) {
          packets.push(blockPacket)
        }
      }

      for (const packet of packets) {
        placeBlock(packet)
      }
    }

    function sendChatMessage(message: string) {
      getPwGameClient().send('playerChatPacket', {
        message: `[BOT] ${message}`,
      })
    }

    async function onDisconnectButtonClick() {
      getPwGameClient().disconnect(false)

      PWClientStore.pwGameClient = undefined
      PWClientStore.pwApiClient = undefined
      await router.push({ name: LoginRoute.name })
    }

    return {
      loading,
      onDisconnectButtonClick,
    }
  },
})
