import App from '@/App.vue'
import vuetify from '@/plugins/vuetify.ts'
import { createPinia } from 'pinia'
import { createRouter } from '@/router/router'
import { createApp } from 'vue'

const pinia = createPinia()
const router = createRouter() // Relies on pinia being initialised
const app = createApp(App)

console.log('main')
app.use(vuetify)
app.use(pinia)
app.use(router)
app.mount('#app')
