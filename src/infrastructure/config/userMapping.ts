/**
 * Mapping de IDs de WhatsApp a nombres de usuario
 */
export const wppIdToName: Record<string, string> = {
  "211707561525347@lid": "Juan",
  "176810985787444@lid": "Manuel",
  "35520151318745@lid": "Jesú",
  "218571137413288@lid": "Kadir",
  "274830712643796@lid": "Camidev",
};

/**
 * Obtiene el nombre del usuario basado en su ID de WhatsApp
 * @param wppId ID de WhatsApp del usuario
 * @returns Nombre del usuario o el ID si no está mapeado
 */
export function getUserName(wppId: string): string {
  return wppIdToName[wppId] || wppId;
}
