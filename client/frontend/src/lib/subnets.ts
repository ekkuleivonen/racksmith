import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";

export interface SubnetMeta {
  cidr: string;
  name: string;
  description: string;
}

const SUBNETS_PER_PAGE = 200;

export async function listSubnets(): Promise<SubnetMeta[]> {
  const data = await apiGet<{
    items: SubnetMeta[];
    total: number;
    page: number;
    per_page: number;
  }>(`/subnets?page=1&per_page=${SUBNETS_PER_PAGE}`);
  return data.items;
}

/** Create or update subnet metadata; pass whether this CIDR already exists in meta. */
export async function upsertSubnet(
  cidr: string,
  data: { name: string; description: string },
  existsInMeta: boolean,
): Promise<SubnetMeta | null> {
  const enc = encodeURIComponent(cidr);
  if (!data.name.trim() && !data.description.trim()) {
    if (existsInMeta) {
      await apiDelete(`/subnets/${enc}`);
    }
    return null;
  }
  if (existsInMeta) {
    const { subnet } = await apiPatch<{ subnet: SubnetMeta }>(`/subnets/${enc}`, {
      name: data.name,
      description: data.description,
    });
    return subnet;
  }
  const { subnet } = await apiPost<{ subnet: SubnetMeta }>("/subnets", {
    cidr,
    name: data.name,
    description: data.description,
  });
  return subnet;
}
