// Semua tautan resmi BEARN dikelola dari file ini.
// Isi URL di bawah setelah akun resmi dibuat. Jangan menaruh link pribadi yang belum diverifikasi.
export const COMMUNITY_LINKS = {
  adminWhatsApp: '',
  adminTelegram: '',
  adminFacebook: '',
  adminInstagram: '',
  communityWhatsApp: '',
  communityTelegram: '',
  facebook: '',
  instagram: '',
  youtube: '',
  tiktok: '',
  x: ''
};

export function getAdminContact() {
  return COMMUNITY_LINKS.adminWhatsApp || COMMUNITY_LINKS.adminTelegram || COMMUNITY_LINKS.adminFacebook || COMMUNITY_LINKS.adminInstagram || '';
}
