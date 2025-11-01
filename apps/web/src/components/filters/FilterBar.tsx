import React from "react";
import type { HierarchyStatus } from "../../types/hierarchy";

export type TaskFilters = {
  status: string | null;
  search: string;
};

type FilterBarProps = {
  filters: TaskFilters;
  onChange(next: TaskFilters): void;
  availableStatuses: HierarchyStatus[];
  disabled?: boolean;
};

const SEARCH_PLACEHOLDER = "Search tasks by title or description…";

export const FilterBar: React.FC<FilterBarProps> = ({ filters, onChange, availableStatuses, disabled }) => {
  const handleStatusChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange({
      ...filters,
      status: event.target.value === "" ? null : event.target.value
    });
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filters,
      search: event.target.value
    });
  };

  return (
    <div className="filter-bar" role="region" aria-label="Task filters">
      <label className="filter-field">
        <span>Status</span>
        <select value={filters.status ?? ""} onChange={handleStatusChange} disabled={disabled}>
          <option value="">All statuses</option>
          {availableStatuses.map((status) => (
            <option key={status.status_id} value={status.name}>
              {status.name}
            </option>
          ))}
        </select>
      </label>
      <label className="filter-field filter-search">
        <span className="sr-only">Search tasks</span>
        <input
          type="search"
          value={filters.search}
          onChange={handleSearchChange}
          placeholder={SEARCH_PLACEHOLDER}
          disabled={disabled}
        />
      </label>
    </div>
  );
};
