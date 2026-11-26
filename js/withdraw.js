import { init } from '/js/core.js';
import { bindWithdraw } from '/js/wallet.js';
document.addEventListener('DOMContentLoaded', async () => { await init(); bindWithdraw(); });
