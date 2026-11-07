// The one place to set contract addresses, the Worker URL and links.
// Leave `contract` empty to run in preview mode (a simulated contract saved in this browser).
export const CONFIG = {
  networks: {
    mainnet: {
      chainId: 677,
      name: 'BOT Chain',
      rpc: 'https://rpc.botchain.ai',
      explorer: 'https://scan.botchain.ai',
      contract: '0x9Da8F988625e8785c56737A6EEF5E6b5bF6f23a3', // MyCityStripes on BOT Chain mainnet (also in the README)
    },
    testnet: {
      chainId: 968,
      name: 'BOT Chain Testnet',
      rpc: 'https://rpc.bohr.life',
      explorer: 'https://scan.bohr.life',
      contract: '', // ← testnet address (used with ?net=testnet)
    },
  },
  // Shared Week 1 Worker with the GET /stripes route. Empty → the browser calls Open-Meteo directly.
  workerUrl: '',
  links: {
    botchain: 'https://botchain.ai',
    github: 'https://github.com/',
    x: 'https://x.com/',
  },
  storageKey: 'mcs',
};
