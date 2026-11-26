import { init } from '/js/core.js';
import { bindAuth } from '/js/auth.js';
document.addEventListener('DOMContentLoaded', async () => { await init(); bindAuth(); });
