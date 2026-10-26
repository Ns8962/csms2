import {
  ChevronRight,
  History,
  LayoutGrid,
  type LucideIcon,
  LogOut,
  Settings,
  Sparkles,
  Stethoscope,
  Trash2,
  Undo2,
  FilePlus2,
  FileSpreadsheet,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { CHANGELOG } from '../changelog.ts'
import { DepositLost } from '../pages/DepositLost.tsx'
import { DepositRemove } from '../pages/DepositRemove.tsx'
import { DepositReturn } from '../pages/DepositReturn.tsx'
import { DfEdit } from '../pages/DfEdit.tsx'
import { ExportData } from '../pages/ExportData.tsx'

type MenuKey = 'deposit_return' | 'deposit_lost' | 'deposit_remove' | 'df_edit' | 'export_data'

// Each page uses the same icon in its sidebar button and in its page title (see PageHeader).
const MENU: { key: MenuKey; label: string; icon: LucideIcon }[] = [
  { key: 'deposit_return', label: 'คืนยอดมัดจำ', icon: Undo2 },
  { key: 'deposit_lost', label: 'รายการมัดจำไม่แสดง', icon: FilePlus2 },
  { key: 'deposit_remove', label: 'ลบรายการมัดจำ', icon: Trash2 },
  { key: 'df_edit', label: 'แก้ไข DF', icon: Stethoscope },
  { key: 'export_data', label: 'Export data', icon: FileSpreadsheet },
]

// CHANGELOG is newest first: the badge and the top of the popup show the latest release.
const [latest, ...earlier] = CHANGELOG

export function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [menu, setMenu] = useState<MenuKey>('deposit_return')
  const [showChangelog, setShowChangelog] = useState(false)

  return (
    <div className="flex min-h-screen bg-gray-900">
      <aside className="w-64 bg-gray-800 p-4 shadow-md min-h-screen flex flex-col">
        <div className="flex items-center justify-between mb-4 relative">
          <h2 className="inline-flex items-center gap-2 text-white text-base font-bold">
            <LayoutGrid className="h-4 w-4 text-blue-400" aria-hidden="true" />
            Menu
          </h2>
          <button
            onClick={() => setShowChangelog((v) => !v)}
            className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-2 py-1 rounded-full transition duration-200"
            title="สิ่งที่อัปเดต"
          >
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Update {latest.version}
          </button>
          {showChangelog && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
              onClick={() => setShowChangelog(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`อัปเดต ${latest.version}`}
                className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 z-10 flex items-center justify-between bg-gray-800 px-5 pt-5 pb-3">
                  <p className="inline-flex items-center gap-2 text-lg font-semibold text-green-300">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                    อัปเดตรอบนี้ ({latest.version})
                  </p>
                  <button
                    onClick={() => setShowChangelog(false)}
                    className="rounded-md p-1 text-gray-400 hover:bg-gray-700 hover:text-white transition duration-200"
                    aria-label="ปิด"
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="px-5 pb-5">
                  <p className="text-xs text-gray-400 mb-3">{latest.date}</p>
                  <ul className="list-disc list-outside pl-5 space-y-2 text-sm text-gray-200">
                    {latest.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  {earlier.length > 0 && (
                    <details className="group mt-5 border-t border-gray-700 pt-4">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-gray-400 hover:text-gray-200 [&::-webkit-details-marker]:hidden">
                        <History className="h-4 w-4" aria-hidden="true" />
                        เวอร์ชันก่อนหน้า
                        <ChevronRight
                          className="ml-auto h-4 w-4 transition-transform group-open:rotate-90"
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="mt-3">
                        {earlier.map((release) => (
                          <div key={release.version} className="mb-4 last:mb-0">
                            <p className="text-sm font-medium text-gray-300">
                              {release.version}
                              <span className="ml-2 text-xs font-normal text-gray-500">{release.date}</span>
                            </p>
                            <ul className="mt-2 list-disc list-outside pl-5 space-y-1.5 text-xs text-gray-400">
                              {release.items.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
        <ul className="space-y-3 flex-1">
          {MENU.map(({ key, label, icon: Icon }) => (
            <li key={key}>
              <button
                onClick={() => setMenu(key)}
                aria-current={menu === key ? 'page' : undefined}
                className={`w-full flex items-center gap-3 text-left py-2 px-4 rounded-lg transition duration-200 ${
                  menu === key
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                    : 'bg-gray-600 hover:bg-gray-500 text-gray-300 hover:text-white'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="flex-1 p-4">
        <nav className="bg-gray-700 p-4 rounded shadow-md mb-4">
          <div className="flex justify-between items-center">
            <h1 className="inline-flex items-center gap-3 text-lg font-bold text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 text-blue-400">
                <Settings className="h-5 w-5" aria-hidden="true" />
              </span>
              CS Management System
            </h1>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded transition duration-200"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Logout
            </button>
          </div>
        </nav>
        {menu === 'deposit_return' && <DepositReturn />}
        {menu === 'deposit_lost' && <DepositLost />}
        {menu === 'deposit_remove' && <DepositRemove />}
        {menu === 'df_edit' && <DfEdit />}
        {menu === 'export_data' && <ExportData />}
      </main>
    </div>
  )
}
