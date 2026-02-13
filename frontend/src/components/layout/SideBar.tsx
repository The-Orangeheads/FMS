import React from "react";
import fmsLogo from "../../assets/logo.svg";
import NavItem from "../common/NavItem";
import {
  LayoutDashboard,
  FolderOpen,
  Clock,
  Star,
  Cloud,
  Briefcase,
  Plus,
  Terminal,
} from "lucide-react";

interface Props {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const SideBar: React.FC<Props> = ({ activeTab, setActiveTab }) => {
  return (
    <div className="h-screen w-64 bg-[#15202B] text-slate-400 flex flex-col p-4 border-r border-slate-800">
      <div className="flex justify-center gap-3 px-2 mb-10">
        <img src={fmsLogo} alt="FMS Logo" className="w-1/2" />
      </div>

      <nav className="flex-1">
        <ul className="space-y-1 list-none">
          <NavItem
            icon={<LayoutDashboard size={20} />}
            label="Dashboard"
            active={activeTab === "Dashboard"}
            onClick={() => setActiveTab("Dashboard")}
          />
          <NavItem
            icon={<FolderOpen size={20} />}
            label="My Files"
            active={activeTab === "My Files"}
            onClick={() => setActiveTab("My Files")}
          />
          <NavItem
            icon={<Clock size={20} />}
            label="Recent"
            active={activeTab === "Recent"}
            onClick={() => setActiveTab("Recent")}
          />
          <NavItem
            icon={<Star size={20} />}
            label="Starred"
            active={activeTab === "Starred"}
            onClick={() => setActiveTab("Starred")}
          />
        </ul>

        <div className="mt-10">
          <h4 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Spaces
          </h4>
          <ul className="space-y-1">
            <NavItem
              icon={<Cloud size={20} className="text-blue-400" />}
              label="Personal"
              active={activeTab === "Personal"}
              onClick={() => setActiveTab("Personal")}
            />
            <NavItem
              icon={<Briefcase size={20} className="text-purple-400" />}
              label="Work"
              active={activeTab === "Work"}
              onClick={() => setActiveTab("Work")}
            />
            <NavItem icon={<Plus size={20} />} label="Create New Space" />
          </ul>
        </div>

        {/* Developer Tab */}
        <div className="mt-10 pt-6 border-t border-slate-800/50">
          <h4 className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Internal Tools
          </h4>
          <ul className="list-none">
            <NavItem
              icon={<Terminal size={20} className="text-orange-400" />}
              label="Developer Lab"
              active={activeTab === "Developer Lab"}
              onClick={() => setActiveTab("Developer Lab")}
            />
          </ul>
        </div>
      </nav>
    </div>
  );
};

export default SideBar;
