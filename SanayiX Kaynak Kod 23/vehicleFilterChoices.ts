import type { SupabaseClient } from '@supabase/supabase-js';
import { vehicleNameKey } from '../supabase/functions/_shared/vehicleNames';
import { appendCatalogPage, CatalogItem, isProviderCatalogId, loadVehicleCatalogPage, loadVehicleVariantChoices, localCatalogItems, resolveCatalogName } from './vehicleCatalog';
import { SavedFilterVehicle, VehicleFilterField, VehicleFilters, VehicleFitment, vehicleFilterOptions } from './marketplaceVehicles';

type ChoicePage = { items: CatalogItem[]; nextOffset: number | null; error: string };
export async function loadVehicleFilterChoices(client: Pick<SupabaseClient, 'rpc'>, input: {
  field: VehicleFilterField; selection: VehicleFilters; saved?: SavedFilterVehicle | null;
  search: string; offset: number; fitments: Promise<VehicleFitment[]>; brand?: CatalogItem; model?: CatalogItem;
  fuelType?: string; gearboxType?: string;
  isCurrent?: () => boolean;
}): Promise<ChoicePage> {
  const { field, selection, saved, search, offset } = input;
  const remote = async () => {
    if(field === 'brand')return loadVehicleCatalogPage(client,{kind:'brands',q:search,offset});
    const brand = input.brand && vehicleNameKey(input.brand.name) === vehicleNameKey(selection.brand) && isProviderCatalogId(input.brand.id)
      ? input.brand : await resolveCatalogName(client, 'brands', selection.brand);
    if (!brand) return null;
    if(field==='model')return loadVehicleCatalogPage(client,{kind:'models',brandId:brand.id,q:search,offset});
    const model=input.model&&vehicleNameKey(input.model.name)===vehicleNameKey(selection.model)&&isProviderCatalogId(input.model.id)
      ? input.model:await resolveCatalogName(client,'models',selection.model,brand.id);
    if(!model)return null;
    const query={kind:field==='year'?'years' as const:'variants' as const,brandId:brand.id,modelId:model.id,q:search,offset,
      year:field==='engine'&&selection.year?Number(selection.year):undefined,fuelType:input.fuelType,gearboxType:input.gearboxType};
    return field === 'engine' ? loadVehicleVariantChoices(client, query, input.isCurrent) : loadVehicleCatalogPage(client, query);
  };
  const [localResult, remoteResult] = await Promise.allSettled([input.fitments, remote()]);
  const facets = vehicleFilterOptions(localResult.status === 'fulfilled' ? localResult.value : [], selection, saved);
  // The backend whitelist owns selectable makes. Keep only an already-saved make as an explicit fallback.
  const localNames=field==='brand'?[selection.brand, saved?.brand??'']:[...facets[field],selection[field]];
  const local=localCatalogItems(localNames,search);
  const page=remoteResult.status==='fulfilled'?remoteResult.value:null;
  const messages: string[]=[];
  if(remoteResult.status==='rejected')messages.push('Araç kataloğu yüklenemedi. ' + (remoteResult.reason?.message || 'Tekrar deneyin.'));
  if(localResult.status==='rejected')messages.push('İlanlardaki araç bilgileri yüklenemedi. Tekrar deneyebilirsiniz.');
  if(page?.stale)messages.push('Son kaydedilen katalog gösteriliyor; güncelleme daha sonra yeniden denenecek.');
  const items=appendCatalogPage(local,page?.items??[]);
  if(field==='year')items.sort((a,b)=>Number(b.name)-Number(a.name));
  return {items,nextOffset:page?.nextOffset??null,error:messages.join(' ')};
}
