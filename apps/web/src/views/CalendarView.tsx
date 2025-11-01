import React from "react";

type CalendarViewProps = {
  hasSelection: boolean;
};

export const CalendarView: React.FC<CalendarViewProps> = ({ hasSelection }) => {
  if (!hasSelection) {
    return <p className="empty-state">Select a list to view the calendar.</p>;
  }

  return (
    <div className="calendar-view">
      <div className="calendar-placeholder">
        <p>Calendar view coming soon.</p>
        <p className="calendar-subtext">Scheduling and capacity insights will appear here.</p>
      </div>
    </div>
  );
};
