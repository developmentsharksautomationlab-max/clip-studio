import Image from "next/image";
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2.5 px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/image.png"
            alt="Logo"
            width={28}
            height={28}
            className="h-7 w-7 rounded-md object-cover"
          />
          <span className="text-[15px] font-semibold tracking-tight text-gray-900">Clip Studio</span>
        </Link>
        <Link
          href="/history"
          className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
        >
          History
        </Link>
      </div>
    </nav>
  );
}
