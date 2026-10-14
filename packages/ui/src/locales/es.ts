import type { BchcMessages } from "../messages.ts";

/**
 * The Spanish catalogue, for the `messages` property of `bchc-modal` and
 * `bchc-toast`.
 *
 * @beta
 */
export const BCHC_MESSAGES_ES: BchcMessages = {
	lang: "es",
	connectTitle: "Conecta una billetera",
	getWalletTitle: "Consigue una billetera",
	sessionType: "Tipo de sesión",
	scan: "Escanea con tu billetera",
	initiating: "Obteniendo enlace de conexión",
	linkFailed: "¿No se abrió? Copia el enlace.",
	copyLink: "Copiar enlace",
	linkCopied: "Enlace copiado",
	copyLinkLabel: "Copiar enlace de conexión",
	openInWallet: "Abrir en tu billetera",
	walletsHeading: "Abrir en tu billetera",
	noWallet: "¿No tienes una billetera?",
	directoryHeading: "Billeteras de Bitcoin Cash que funcionan aquí",
	getWallet: (name) => `Obtener ${name}`,
	tryAgain: "Reintentar",
	back: "Atrás",
	close: "Cerrar",
	walletConnected: "Billetera conectada",
	connectedTo: (wallet) => `Conectado a ${wallet}`,
	dismiss: "Descartar",
	rejectedTitle: "La solicitud de conexión fue rechazada",
	rejectedDetail: "Puedes reintentarlo si no fue intencional",
	timeoutTitle: "Tu billetera no respondió",
	timeoutDetail: "Puede que se haya cerrado antes de aprobar",
	abortedTitle: "Conexión detenida",
	abortedDetail: "La solicitud terminó antes de que tu billetera respondiera.",
	transportTitle: "No se pudo contactar con tu billetera",
	transportDetail: "Inténtalo de nuevo en un momento.",
	networkMismatchTitle: "Tu billetera está en otra red",
	networkMismatchDetail: "Cambia de red en tu billetera y vuelve a conectar.",
	unsupportedTitle: "Esa billetera no admite este tipo de sesión",
	unsupportedDetail: "Elige otro tipo de sesión u otra billetera.",
};
