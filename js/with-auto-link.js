import {param} from '/js/flow-common.js';
document.addEventListener('DOMContentLoaded',()=>{const slug=param('slug')||'';document.getElementById('accessMessage').textContent='Halaman akses siap. URL tujuan harus diberikan oleh endpoint redirect yang memverifikasi pembayaran atau sesi iklan di server.';document.getElementById('openDestination').href='/go.html?slug='+encodeURIComponent(slug);});
