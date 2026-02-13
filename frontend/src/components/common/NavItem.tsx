import type { NavItemProps } from "../../types/ui";

const NavItem = ({ icon, label, active = false, onClick }: NavItemProps) => {
  return (
    <li>
      <button
        onClick={onClick}
        className={`flex items-center w-full gap-3 px-3 py-2.5 rounded-lg transition-colors group
          ${
            active
              ? "bg-blue-600/10 text-blue-500 border-l-4 border-blue-500 rounded-l-none"
              : "hover:bg-slate-800 hover:text-white"
          }`}
      >
        <span
          className={
            active ? "text-blue-500" : "text-slate-400 group-hover:text-white"
          }
        >
          {icon}
        </span>
        <span className="font-medium">{label}</span>
      </button>
    </li>
  );
};

export default NavItem;
