import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, Globe, Instagram } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const DICTIONARY = {
  id: {
    motto: "Sekolah adalah belajar hidup, tamat sekolah harus bisa hidup, bukan baru belajar hidup.",
    address: "Jl. Pelabuhan II Km. 10, Kp. Cikaret, RT.002/RW.014, Desa Kebonmanggu, Kec. Gunungguruh, Kabupaten Sukabumi, Jawa Barat 43156",
    contactUs: "Hubungi Kami",
    quickLinks: "Tautan Cepat",
    officialWebsite: "Website Resmi Ponpes",
    visionMission: "Visi & Misi",
    admission: "Pendaftaran Santri",
    allRightsReserved: "Hak Cipta Dilindungi Undang-Undang.",
  },
  en: {
    motto: "School is learning to live, graduating school must be able to live, not just learning to live.",
    address: "Jl. Pelabuhan II Km. 10, Kp. Cikaret, RT.002/RW.014, Kebonmanggu, Gunungguruh, Sukabumi, West Java 43156",
    contactUs: "Contact Us",
    quickLinks: "Quick Links",
    officialWebsite: "Official Pesantren Website",
    visionMission: "Vision & Mission",
    admission: "New Student Admission",
    allRightsReserved: "All Rights Reserved.",
  }
} as const;

export function Footer() {
  const { lang } = useLanguage();
  const t = DICTIONARY[lang];
  const year = new Date().getFullYear();

  return (
    <footer className="bg-[#111827] text-[#9CA3AF] border-t border-[#1F2937] font-['Hanken_Grotesk',system-ui,sans-serif] pb-14 lg:pb-0">
      {/* Upper Footer: Links & Info */}
      <div className="hidden md:grid max-w-7xl mx-auto px-4 py-10 md:py-16 grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
        {/* Column 1: Brand & Motto */}
        <div className="space-y-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="Al Umanaa"
              className="h-10 w-10 object-contain bg-white rounded-full p-0.5"
            />
            <span className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-white tracking-wide">
              Al-Umanaa <span className="font-light text-amber-400 text-xs">{lang === "id" ? "Koperasi" : "Cooperative"}</span>
            </span>
          </Link>
          <p className="text-xs italic leading-relaxed text-[#D1D5DB] max-w-sm">
            &ldquo;{t.motto}&rdquo;
          </p>
          {/* Social Media Icons */}
          <div className="flex items-center gap-3 pt-2">
            <a
              href="https://www.instagram.com/alumanaa.id"
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 w-8 rounded-full bg-[#1F2937] text-white flex items-center justify-center hover:bg-gradient-to-tr hover:from-purple-600 hover:to-pink-500 transition-all duration-300 hover:scale-110"
              aria-label="Instagram"
              title="Instagram @alumanaa.id"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href="https://wa.me/6285218731046"
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 w-8 rounded-full bg-[#1F2937] text-white flex items-center justify-center hover:bg-emerald-600 transition-all duration-300 hover:scale-110"
              aria-label="WhatsApp"
              title="WhatsApp Support"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-4 w-4"
              >
                <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232" />
              </svg>
            </a>
          </div>
        </div>

        {/* Column 2: Contact Info */}
        <div className="space-y-4">
          <h4 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-white uppercase tracking-wider">
            {t.contactUs}
          </h4>
          <ul className="space-y-3 text-xs">
            <li className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{t.address}</span>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-amber-500 shrink-0" />
              <a href="tel:+622666325409" className="hover:text-white transition-colors">
                +62 266 6325409
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-amber-500 shrink-0" />
              <a href="mailto:info@alumanaa.com" className="hover:text-white transition-colors">
                info@alumanaa.com
              </a>
            </li>
          </ul>
        </div>

        {/* Column 3: Quick Links */}
        <div className="space-y-4">
          <h4 className="font-['Manrope',system-ui,sans-serif] text-sm font-bold text-white uppercase tracking-wider">
            {t.quickLinks}
          </h4>
          <ul className="space-y-2.5 text-xs font-semibold">
            <li>
              <a
                href="https://www.alumanaa.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-white transition-colors group"
              >
                <Globe className="h-4 w-4 text-amber-500 group-hover:rotate-12 transition-transform" />
                <span>{t.officialWebsite}</span>
              </a>
            </li>
            <li>
              <a
                href="https://www.alumanaa.com/visi-dan-misi/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-white transition-colors"
              >
                <span className="text-amber-500">&bull;</span>
                <span>{t.visionMission}</span>
              </a>
            </li>
            <li>
              <a
                href="https://www.alumanaa.com/formulir-pendaftaran/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:text-white transition-colors"
              >
                <span className="text-amber-500">&bull;</span>
                <span>{t.admission}</span>
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom Footer: Copyright */}
      <div className="bg-[#0f172a] py-6 border-t border-[#1e293b] text-center text-[10px] md:text-xs">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-[#64748b]">
          <p>
            &copy; {year} <span className="font-bold text-neutral-400">Koperasi Al-Umanaa</span>. {t.allRightsReserved}
          </p>
          <p className="text-[10px]">
            Pondok Pesantren Modern Al Umanaa Sukabumi
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
