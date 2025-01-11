import { defineComponent, onBeforeMount, ref } from 'vue'

import { PWApiClient } from 'pw-js-api'
import { VForm } from 'vuetify/components'
import { usePWClientStore } from '@/stores/PWClient.ts'
import { useRouter } from 'vue-router'
import { MessageService } from '@/services/MessageService.ts'
import { GENERAL_CONSTANTS } from '@/constants/general.ts'
import { BotInfoRoute } from '@/router/routes.ts'

export default defineComponent({
  setup() {
    const email = ref('')
    const password = ref('')
    const worldId = ref('')
    const loading = { loading: ref(false) }
    const form = ref<VForm>()

    const PWClientStore = usePWClientStore()
    const router = useRouter()

    onBeforeMount(async () => {})

    async function authenticate(pwApiClient: PWApiClient): Promise<boolean> {
      const authenticationResult = await pwApiClient.authenticate()

      if ('token' in authenticationResult) {
        return true
      }

      if ('message' in authenticationResult) {
        MessageService.error(authenticationResult.message)
      } else {
        MessageService.error(GENERAL_CONSTANTS.GENERIC_ERROR)
      }

      return false
    }

    async function joinWorld(pwApiClient: PWApiClient): Promise<boolean> {
      try {
        PWClientStore.pwGameClient = await pwApiClient.joinWorld(worldId.value, {
          gameSettings: {
            handlePackets: ['PING'],
          },
        })
        PWClientStore.pwGameClient.addCallback('debug', console.log)

        PWClientStore.pwGameClient
          .addCallback('playerInitPacket', (data) => {
            console.log('Connected as ' + data.playerProperties?.username)

            // if (data.playerProperties) {
            //   botId = data.playerProperties.playerId
            //   isOwner = data.playerProperties.isWorldOwner
            // }

            PWClientStore.pwGameClient?.send('playerInitReceived')
          })
          .addCallback('playerJoinedPacket', (data) => {
            // console.log(
            //   data.properties?.username + (data.properties.playerId < botId ? ' is here.' : ' joined the world.'),
            // )
          })
        return true
      } catch (e) {
        MessageService.error('Failed to join world. ' + e.message)
        return false
      }
    }

    async function onConnectButtonClick() {
      if (!(await form.value!.validate()).valid) {
        return
      }

      PWClientStore.pwApiClient = new PWApiClient(email.value, password.value)

      if (!(await authenticate(PWClientStore.pwApiClient))) {
        return
      }

      if (!(await joinWorld(PWClientStore.pwApiClient))) {
        return
      }

      // const mappings = await pwApiClient.getMappings()
      // const blockIdToType = swapObject(mappings)

      await router.push({ name: BotInfoRoute.name })

      // const pwGameClient = PWClientStore.pwGameClient

      // /**
      //  * Doesn't support filling
      //  * @param {string} blockId
      //  * @param {{ x: number, y: number }[]} positions
      //  * @param {0|1} layer
      //  * @returns
      //  */
      // const place = (blockId, positions, layer = 1) => {
      //   return pwGameClient.send('worldBlockPlacedPacket', {
      //     blockId: mappings[blockId],
      //     layer,
      //     positions,
      //     isFillOperation: false,
      //   })
      // }
      //
      // let botId = 1
      // let isOwner = false
      //
      // // You can use setCallBack (which returns itself for chaining)
      // pwGameClient
      //   .addCallback('playerInitPacket', (data) => {
      //     console.log('Connected as ' + data.playerProperties?.username)
      //
      //     if (data.playerProperties) {
      //       botId = data.playerProperties.playerId
      //       isOwner = data.playerProperties.isWorldOwner
      //     }
      //
      //     pwGameClient.send('playerInitReceived')
      //   })
      //   .addCallback('playerJoinedPacket', (data) => {
      //     console.log(
      //       data.properties?.username + (data.properties.playerId < botId ? ' is here.' : ' joined the world.'),
      //     )
      //   })
      //
      // pwGameClient.addCallback('debug', console.log)
      //
      // // const snakeable = ["basic_", "brick_", "beveled_", "glass_", "minerals_"];
      //
      // // con.addCallback("worldBlockPlacedPacket", async function (data) {
      // //   if (data.playerId === botId) return;
      // //
      // //   if (isOwner) {
      // //     const blockId = blockIdToType[data.blockId];
      // //
      // //     if (data.isFillOperation) return; // fills have long cooldown.
      // //
      // //     if (snakeable.some(v => blockId === v + "green" || blockId === v + "red")) {
      // //       if (blockId.endsWith("green")) {
      // //         await setTimeout(150).then(() => place(blockId.split("_")[0] + "_red", data.positions, 1));
      // //       }
      // //       await setTimeout(300).then(() => place("empty", data.positions, 1));
      // //     }
      // //   }
      // // });
      //
      // let helpTime = -1
      //
      // pwGameClient.addCallback('systemMessagePacket', (data) => {
      //   // From /help - continuation of .ping
      //   if (data.message.startsWith('Available commands:')) {
      //     pwGameClient.send('playerChatPacket', {
      //       message: 'Pong! Response time: ' + (Date.now() - helpTime) + 'ms.',
      //     })
      //   }
      // })
      //
      // // A con accepts multiple callbacks for the same type!
      // // If one of the callback returns a "STOP" (similar to your typical event's stop propagation). It can even return a promise resolving to STOP too.
      //
      // // For example:
      // // All messages will get logged if and only if the person isn't the bot.
      // // This can be tested with the ".say .ping" command where you will notice that the bot's messages does not get logged nor will it be listened to.
      // pwGameClient.addCallback('playerChatPacket', (data) => {
      //   if (data.playerId === botId) return 'STOP'
      //
      //   console.log(data.message)
      // })
      //
      // pwGameClient.addCallback('playerChatPacket', (data) => {
      //   const args = data.message.split(' ')
      //
      //   switch (args[0].toLowerCase()) {
      //     case '.ping':
      //       helpTime = Date.now()
      //       pwGameClient.send('playerChatPacket', {
      //         message: '/help',
      //       })
      //       break
      //     case '.disconnect':
      //       if (args[1] === '-f') pwGameClient.settings.reconnectable = false
      //
      //       pwGameClient.socket?.close()
      //       break
      //     case '.say':
      //       pwGameClient.send('playerChatPacket', {
      //         message: args.slice(1).join(' '),
      //       })
      //       break
      //   }
      // })
      //
      // function swapObject(obj) {
      //   /**
      //    * @type {Record<Y, K>}
      //    */
      //   const res = {}
      //
      //   /**
      //    * @type {[Y, string][]}
      //    */
      //   const entries = Object.entries(obj)
      //
      //   for (let i = 0, len = entries.len; i < len; i++) {
      //     res[entries[i][1]] = entries[i][0]
      //   }
      //
      //   return res
      // }
      //

      //
    }

    function setWorldId() {
      worldId.value = 'r3c188b31614b7f'
    }

    return {
      email,
      password,
      worldId,
      loading,
      form,
      onConnectButtonClick,
      setWorldId,
    }
  },
})
