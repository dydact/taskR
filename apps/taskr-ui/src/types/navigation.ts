export type NavigationList = {
  list_id: string;
  name: string;
  folder_id: string | null;
  color: string | null;
  space_id: string;
};

export type NavigationFolder = {
  folder_id: string;
  name: string;
  space_id: string;
  lists: NavigationList[];
};

export type NavigationSpace = {
  space_id: string;
  slug: string;
  name: string;
  color: string | null;
  folders: NavigationFolder[];
  root_lists: NavigationList[];
};
