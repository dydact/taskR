export type Doc = {
  doc_id: string;
  tenant_id: string;
  title: string;
  slug: string;
  summary: string | null;
  space_id: string | null;
  list_id: string | null;
  created_at: string;
  updated_at: string;
};
