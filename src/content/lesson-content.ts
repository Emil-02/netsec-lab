// Static imports so every lesson (and the client components it uses) is part of the build graph.
import type { MDXContent } from "mdx/types";
import PengenalanEtikaDanHukum from "./lessons/pengenalan/etika-dan-hukum.mdx";
import PengenalanSelamatDatang from "./lessons/pengenalan/selamat-datang.mdx";
import PengenalanTurLab from "./lessons/pengenalan/tur-lab.mdx";
import LinuxDasarMengelolaFile from "./lessons/linux-dasar/mengelola-file.mdx";
import LinuxDasarNavigasiFileSystem from "./lessons/linux-dasar/navigasi-file-system.mdx";
import LinuxDasarPipeDanGrep from "./lessons/linux-dasar/pipe-dan-grep.mdx";
import LinuxDasarTerminalDanShell from "./lessons/linux-dasar/terminal-dan-shell.mdx";
import LinuxDasarUserDanPermission from "./lessons/linux-dasar/user-dan-permission.mdx";
import KonsepJaringanApaItuJaringan from "./lessons/konsep-jaringan/apa-itu-jaringan.mdx";
import KonsepJaringanHubVsSwitch from "./lessons/konsep-jaringan/hub-vs-switch.mdx";
import KonsepJaringanPerangkatJaringan from "./lessons/konsep-jaringan/perangkat-jaringan.mdx";
import KonsepJaringanTopologiJaringan from "./lessons/konsep-jaringan/topologi-jaringan.mdx";
import ModelOsiKenapaBerlapis from "./lessons/model-osi/kenapa-berlapis.mdx";
import ModelOsiTcpIpDanEnkapsulasi from "./lessons/model-osi/tcp-ip-dan-enkapsulasi.mdx";
import ModelOsiTujuhLayerOsi from "./lessons/model-osi/tujuh-layer-osi.mdx";
import IpSubnettingAlamatIpDanMac from "./lessons/ip-subnetting/alamat-ip-dan-mac.mdx";
import IpSubnettingBinerDanSubnetMask from "./lessons/ip-subnetting/biner-dan-subnet-mask.mdx";
import IpSubnettingGatewayDanKonfigurasiIp from "./lessons/ip-subnetting/gateway-dan-konfigurasi-ip.mdx";
import IpSubnettingMenghitungSubnet from "./lessons/ip-subnetting/menghitung-subnet.mdx";
import Layer2Arp from "./lessons/layer-2/arp.mdx";
import Layer2MacTable from "./lessons/layer-2/mac-table.mdx";
import Layer2Vlan from "./lessons/layer-2/vlan.mdx";
import RoutingNat from "./lessons/routing/nat.mdx";
import RoutingStaticRoute from "./lessons/routing/static-route.mdx";
import RoutingTabelRouting from "./lessons/routing/tabel-routing.mdx";
import TransportPort from "./lessons/transport/port.mdx";
import TransportTcpHandshake from "./lessons/transport/tcp-handshake.mdx";
import TransportUdp from "./lessons/transport/udp.mdx";
import LayananAplikasiDhcp from "./lessons/layanan-aplikasi/dhcp.mdx";
import LayananAplikasiDns from "./lessons/layanan-aplikasi/dns.mdx";
import LayananAplikasiHttp from "./lessons/layanan-aplikasi/http.mdx";
import DasarKeamananCiaTriad from "./lessons/dasar-keamanan/cia-triad.mdx";
import DasarKeamananKriptografi from "./lessons/dasar-keamanan/kriptografi.mdx";
import ReconnaissanceNmap from "./lessons/reconnaissance/nmap.mdx";
import ReconnaissanceReconDanOsint from "./lessons/reconnaissance/recon-dan-osint.mdx";
import SniffingMitmArpSpoofing from "./lessons/sniffing-mitm/arp-spoofing.mdx";
import SniffingMitmSniffing from "./lessons/sniffing-mitm/sniffing.mdx";
import SeranganPasswordSeranganPassword from "./lessons/serangan-password/serangan-password.mdx";
import PertahananJaringanFirewall from "./lessons/pertahanan-jaringan/firewall.mdx";
import PertahananJaringanIdsDanRespons from "./lessons/pertahanan-jaringan/ids-dan-respons.mdx";

/** Lesson key ("module/lesson") → compiled MDX component. */
export const lessonContent: Record<string, MDXContent> = {
  "pengenalan/etika-dan-hukum": PengenalanEtikaDanHukum,
  "pengenalan/selamat-datang": PengenalanSelamatDatang,
  "pengenalan/tur-lab": PengenalanTurLab,
  "linux-dasar/mengelola-file": LinuxDasarMengelolaFile,
  "linux-dasar/navigasi-file-system": LinuxDasarNavigasiFileSystem,
  "linux-dasar/pipe-dan-grep": LinuxDasarPipeDanGrep,
  "linux-dasar/terminal-dan-shell": LinuxDasarTerminalDanShell,
  "linux-dasar/user-dan-permission": LinuxDasarUserDanPermission,
  "konsep-jaringan/apa-itu-jaringan": KonsepJaringanApaItuJaringan,
  "konsep-jaringan/hub-vs-switch": KonsepJaringanHubVsSwitch,
  "konsep-jaringan/perangkat-jaringan": KonsepJaringanPerangkatJaringan,
  "konsep-jaringan/topologi-jaringan": KonsepJaringanTopologiJaringan,
  "model-osi/kenapa-berlapis": ModelOsiKenapaBerlapis,
  "model-osi/tcp-ip-dan-enkapsulasi": ModelOsiTcpIpDanEnkapsulasi,
  "model-osi/tujuh-layer-osi": ModelOsiTujuhLayerOsi,
  "ip-subnetting/alamat-ip-dan-mac": IpSubnettingAlamatIpDanMac,
  "ip-subnetting/biner-dan-subnet-mask": IpSubnettingBinerDanSubnetMask,
  "ip-subnetting/gateway-dan-konfigurasi-ip": IpSubnettingGatewayDanKonfigurasiIp,
  "ip-subnetting/menghitung-subnet": IpSubnettingMenghitungSubnet,
  "layer-2/arp": Layer2Arp,
  "layer-2/mac-table": Layer2MacTable,
  "layer-2/vlan": Layer2Vlan,
  "routing/nat": RoutingNat,
  "routing/static-route": RoutingStaticRoute,
  "routing/tabel-routing": RoutingTabelRouting,
  "transport/port": TransportPort,
  "transport/tcp-handshake": TransportTcpHandshake,
  "transport/udp": TransportUdp,
  "layanan-aplikasi/dhcp": LayananAplikasiDhcp,
  "layanan-aplikasi/dns": LayananAplikasiDns,
  "layanan-aplikasi/http": LayananAplikasiHttp,
  "dasar-keamanan/cia-triad": DasarKeamananCiaTriad,
  "dasar-keamanan/kriptografi": DasarKeamananKriptografi,
  "reconnaissance/nmap": ReconnaissanceNmap,
  "reconnaissance/recon-dan-osint": ReconnaissanceReconDanOsint,
  "sniffing-mitm/arp-spoofing": SniffingMitmArpSpoofing,
  "sniffing-mitm/sniffing": SniffingMitmSniffing,
  "serangan-password/serangan-password": SeranganPasswordSeranganPassword,
  "pertahanan-jaringan/firewall": PertahananJaringanFirewall,
  "pertahanan-jaringan/ids-dan-respons": PertahananJaringanIdsDanRespons,
};
