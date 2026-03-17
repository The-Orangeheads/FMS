import type { ReactNode } from "react";

export interface NavItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}
