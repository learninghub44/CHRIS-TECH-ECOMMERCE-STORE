import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import MpesaProviderService from "./service"

export default ModuleProvider(Modules.PAYMENT, {
  services: [MpesaProviderService],
})
