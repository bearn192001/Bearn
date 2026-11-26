
import { init } from '/js/core.js';
import { loadWallet } from '/js/wallet.js';
import { money } from '/js/core.js';
document.addEventListener('DOMContentLoaded', async () => {
 await init(); await loadWallet();
 const c=window.BEARN?.client;
 const {data,error}=await c?.rpc('get_dashboard_metrics')||{};
 if(error){console.warn('Dashboard metrics:',error.message);return;}
 if(!data)return;
 const values={
  autoLinkCount:data.auto_link_count,
  paymentLinkCount:data.payment_link_count,
  paymentLinkRevenue:money(data.payment_link_revenue),
  autoLinkRevenue:money(data.auto_link_revenue),
  paymentLinkSales:`${data.payment_link_paid_count||0} transaksi berhasil`,
  autoLinkSales:`${data.auto_link_paid_count||0} transaksi berhasil`,
  salesToday:data.sales_today,
  salesTotal:data.sales_total
 };
 for(const [id,value] of Object.entries(values)){const node=document.getElementById(id);if(node)node.textContent=value;}
});
