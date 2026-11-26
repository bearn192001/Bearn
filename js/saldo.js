import { init } from '/js/core.js';
import { loadWallet } from '/js/wallet.js';
document.addEventListener('DOMContentLoaded', async () => { await init(); await loadWallet(); });
