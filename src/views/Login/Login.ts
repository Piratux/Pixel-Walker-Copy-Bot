import { computed, defineComponent, ref } from 'vue'

import { PWApiClient, PWGameClient } from 'pw-js-api'
import { VForm } from 'vuetify/components'
import { getPwApiClient, getPwGameClient, usePWClientStore } from '@/stores/PWClientStore.ts'
import { useRouter } from 'vue-router'
import { MessageService } from '@/services/MessageService.ts'
import { GENERAL_CONSTANTS } from '@/constants/general.ts'
import { BotInfoRoute } from '@/router/routes.ts'
import { registerCallbacks } from '@/services/PacketHandler.ts'
import { getReversedRecord } from '@/utils/reverse_record.ts'

export default defineComponent({
  setup() {
    const email = ref('')
    const password = ref('')
    const worldId = ref('')
    const loading = { loading: ref(false) }
    const form = ref<VForm>()

    const router = useRouter()
    const PWClientStore = usePWClientStore()

    const showSetDefaultWorldIdButton = computed(() => import.meta.env.VITE_SHOW_SET_DEFAULT_WORLD_ID_BUTTON === 'TRUE')

    async function authenticate(): Promise<boolean> {
      const authenticationResult = await getPwApiClient().authenticate()

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

    async function joinWorld(): Promise<boolean> {
      try {
        await getPwGameClient().joinWorld(worldId.value)

        return true
      } catch (e) {
        MessageService.error('Failed to join world. ' + (e as Error).message)
        return false
      }
    }

    async function onConnectButtonClick() {
      PWClientStore.worldId = worldId.value
      if (!(await form.value!.validate()).valid) {
        return
      }

      PWClientStore.setPwApiClient(new PWApiClient(email.value, password.value))

      if (!(await authenticate())) {
        return
      }

      PWClientStore.setPwGameClient(new PWGameClient(getPwApiClient()))

      registerCallbacks()

      if (!(await joinWorld())) {
        return
      }

      PWClientStore.blockMappings = await getPwApiClient().getMappings()
      PWClientStore.blockMappingsReversed = getReversedRecord(PWClientStore.blockMappings)

      await router.push({ name: BotInfoRoute.name })
    }

    function setDefaultWorldIdButtonClicked() {
      worldId.value = import.meta.env.VITE_DEFAULT_WORLD_ID
    }

    return {
      email,
      password,
      worldId,
      loading,
      form,
      onConnectButtonClick,
      showSetDefaultWorldIdButton,
      setDefaultWorldIdButtonClicked,
    }
  },
})
