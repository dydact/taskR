export type SpaceSummary = {
  space_id: string;
  slug: string;
  name: string;
  color?: string | null;
};

export type HierarchyStatus = {
  status_id: string;
  name: string;
  category: string;
  color?: string | null;
  is_done: boolean;
};

export type HierarchyList = {
  list: {
    list_id: string;
    name: string;
    folder_id: string | null;
    color?: string | null;
  };
  statuses: HierarchyStatus[];
};

export type HierarchyFolder = {
  folder: {
    folder_id: string;
    name: string;
  };
  lists: HierarchyList[];
};

export type HierarchySpace = {
  space: SpaceSummary;
  folders: HierarchyFolder[];
  root_lists: HierarchyList[];
};
