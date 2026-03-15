import { apiGet, apiPut } from "@/lib/api";

export function getSubnetCidr(ip: string | undefined | null): string {
  if (!ip) return "unknown";
  const parts = ip.split(".");
  if (parts.length !== 4) return "unknown";
  return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
}

export interface SubnetMeta {
  cidr: string;
  name: string;
  description: string;
}

export async function listSubnets(): Promise<SubnetMeta[]> {
  const { subnets } = await apiGet<{ subnets: SubnetMeta[] }>("/subnets");
  return subnets;
}

export async function upsertSubnet(
  cidr: string,
  data: { name: string; description: string },
): Promise<SubnetMeta> {
  const { subnet } = await apiPut<{ subnet: SubnetMeta }>(
    `/subnets/${encodeURIComponent(cidr)}`,
    data,
  );
  return subnet;
}
