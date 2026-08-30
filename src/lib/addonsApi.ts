export interface Addon {
  id: string;
  created_at: string;
  author: string;
  title: string;
  is_verified: boolean;
  download_link: string;
  description: string;
  first_image: string;
  last_image: string;
  link: string;
}

const fixImageUrl = (url?: string | null): string => {
  if (!url) return '';
  if (url.includes('github.com') && url.includes('/blob/')) {
    return url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
  }
  return url;
};

const processAddon = (addon: Addon): Addon => ({
  ...addon,
  first_image: fixImageUrl(addon.first_image),
  last_image: fixImageUrl(addon.last_image),
});

export const fetchAddons = async (limit = 50, offset = 0, search = ''): Promise<Addon[]> => {
  try {
    const url = new URL('https://api.devctr.com/api/addons');
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('offset', offset.toString());
    if (search) url.searchParams.append('search', search);
    url.searchParams.append('order_by', 'created_at');
    url.searchParams.append('order_dir', 'desc');

    const res = await fetch(url.toString());
    const data = await res.json();
    return (data.addons || []).map(processAddon);
  } catch (error) {
    console.error('Failed to fetch addons', error);
    return [];
  }
};

export const fetchAddonDetails = async (id: string): Promise<Addon | null> => {
  try {
    const res = await fetch('https://api.devctr.com/api/addons', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id })
    });
    const data = await res.json();
    return data.addon ? processAddon(data.addon) : null;
  } catch (error) {
    console.error('Failed to fetch addon details', error);
    return null;
  }
};
