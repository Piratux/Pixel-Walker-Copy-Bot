import { defineStore } from 'pinia'
import { PlayerBotData } from '@/types/BotData.ts'

export const useBotStore = defineStore('BotStore', () => {
  // TODO: periodically remove entries for players who left world (though it takes little data)
  let playerBotData: PlayerBotData = {}

  return {
    playerBotData,
  }
})
