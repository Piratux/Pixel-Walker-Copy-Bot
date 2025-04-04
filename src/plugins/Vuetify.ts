import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

const buildVuetify = () =>
  createVuetify({
    ssr: true,
    components,
    directives,
  })

export { buildVuetify as createVuetify }
