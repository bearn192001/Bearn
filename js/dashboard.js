import { init, money, client } from '/js/core.js';
import { loadWallet } from '/js/wallet.js';

document.addEventListener('DOMContentLoaded', async () => {
  await init();
  await loadWallet();
  if (!client) return;
  const { data, error } = await client.rpc('get_dashboard_metrics');
  if (error) {
    console.warn('Dashboard metrics:', error.message);
    return;
  }
  if (!data) return;
  const values = {
    autoLinkCount: Number(data.auto_link_count || 0).toLocaleString('id-ID'),
    paymentLinkCount: Number(data.payment_link_count || 0).toLocaleString('id-ID'),
    paymentLinkRevenue: money(data.payment_link_revenue),
    autoLinkRevenue: money(data.auto_link_revenue),
    autoLinkViewCount: Number(data.auto_link_view_count || 0).toLocaleString('id-ID'),
    autoLinkViewRevenue: money(data.auto_link_view_revenue),
    autoLinkViewToday: Number(data.auto_link_view_today || 0).toLocaleString('id-ID'),
    autoLinkViewRevenueToday: money(data.auto_link_view_revenue_today),
    paymentLinkSales: `${data.payment_link_paid_count || 0} transaksi berhasil`,
    autoLinkSales: `${data.auto_link_paid_count || 0} transaksi berhasil`,
    salesToday: Number(data.sales_today || 0).toLocaleString('id-ID'),
    salesTotal: Number(data.sales_total || 0).toLocaleString('id-ID')
  };
  for (const [id, value] of Object.entries(values)) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }
});
