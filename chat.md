how to use arp to scan a sub net

1:24 PM
arp itself doesn't actively scan — it just shows the local ARP cache. You're probably thinking of arp-scan, which does what you want. Here's the quick rundown:

Using arp-scan:

bash
# Scan your local subnet
sudo arp-scan --localnet

# Scan a specific subnet
sudo arp-scan 192.168.1.0/24

# Specify an interface
sudo arp-scan -I eth0 192.168.1.0/24
This sends ARP requests to every address in the range and reports back which hosts responded, along with their MAC addresses and vendor info.

If you don't have arp-scan installed:

bash
# Debian/Ubuntu
sudo apt install arp-scan

# Arch
sudo pacman -S arp-scan
Alternative using just arp + ping sweep:

If you only have basic tools available, you can populate the ARP cache with a ping sweep and then read it:

bash
# Ping sweep the subnet (sends one ping each, in parallel)
for i in $(seq 1 254); do ping -c 1 -W 1 192.168.1.$i &>/dev/null & done; wait

# Then check the ARP table
arp -a
This is slower and less reliable than arp-scan, but works without extra packages.

Other solid alternatives worth knowing: nmap -sn 192.168.1.0/24 (ping scan) or fping -a -g 192.168.1.0/24 for fast parallel pinging. On your homelab network with multiple clusters, nmap -sn is particularly handy since it also does reverse DNS lookups.

Screenshot 2026-03-24 at 13.28.51.png
cekku@gateway
:
~ $
 sudo arp-scan --localnet Interface: eth0, type: EN10MB, MAC: e4:5f:01:fd:e6:09, IPv4: 192.168.1.105 WARNING: Cannot open MAC/Vendor file ieee-oui.txt: Permission denied WARNING: Cannot open MAC/Vendor file mac-vendor.txt: Permission denied Starting arp-scan 1.10.0 with 256 hosts (https://github.com/royhills/arp-scan) 192.168.1.1     78:20:51:c4:ca:ac       (Unknown) 192.168.1.100   50:3d:d1:7a:dc:d5       (Unknown) 192.168.1.101   cc:ba:bd:e7:d3:f0       (Unknown) 192.168.1.115   78:20:51:42:e1:da       (Unknown)  8 packets received by filter, 0 packets dropped by kernel Ending arp-scan 1.10.0: 256 hosts scanned in 1.858 seconds (137.78 hosts/sec). 4 responded
ekku@gateway
:
~ $
 sudo arp-scan 192.168.20.0/24 Interface: eth0, type: EN10MB, MAC: e4:5f:01:fd:e6:09, IPv4: 192.168.1.105 WARNING: Cannot open MAC/Vendor file ieee-oui.txt: Permission denied WARNING: Cannot open MAC/Vendor file mac-vendor.txt: Permission denied Starting arp-scan 1.10.0 with 256 hosts (https://github.com/royhills/arp-scan)  5 packets received by filter, 0 packets dropped by kernel Ending arp-scan 1.10.0: 256 hosts scanned in 1.879 seconds (136.24 hosts/sec). 0 responded
ekku@gateway
:
~ $
 sudo arp-scan 192.168.20.1/24 Interface: eth0, type: EN10MB, MAC: e4:5f:01:fd:e6:09, IPv4: 192.168.1.105 WARNING: Cannot open MAC/Vendor file ieee-oui.txt: Permission denied WARNING: Cannot open MAC/Vendor file mac-vendor.txt: Permission denied WARNING: host part of 192.168.20.1/24 is non-zero Starting arp-scan 1.10.0 with 256 hosts (https://github.com/royhills/arp-scan)  5 packets received by filter, 0 packets dropped by kernel Ending arp-scan 1.10.0: 256 hosts scanned in 1.855 seconds (138.01 hosts/sec). 0 responded
ekku@gateway
:
~ $
 sudo arp-scan 192.168.30.1/24 Interface: eth0, type: EN10MB, MAC: e4:5f:01:fd:e6:09, IPv4: 192.168.1.105 WARNING: Cannot open MAC/Vendor file ieee-oui.txt: Permission denied WARNING: Cannot open MAC/Vendor file mac-vendor.txt: Permission denied WARNING: host part of 192.168.30.1/24 is non-zero Starting arp-scan 1.10.0 with 256 hosts (https://github.com/royhills/arp-scan)  4 packets received by filter, 0 packets dropped by kernel Ending arp-scan 1.10.0: 256 hosts scanned in 1.868 seconds (137.04 hosts/sec). 0 responded
ekku@gateway
:
~ $

hmm I know those should have devices.

Show more
1:29 PM
The problem is that arp-scan is sending from eth0 on the MGMT subnet (192.168.1.0/24), but the HOME (VLAN 20) and LAB (VLAN 30) subnets are on different VLANs. ARP is a Layer 2 broadcast — it can't cross VLAN boundaries.

You need to specify the correct interface for each VLAN. On your gateway, check what interfaces exist for those VLANs:

bash
ip -br addr
You'll likely see VLAN-tagged interfaces like eth0.20, eth0.30, br20, br-lan, or similar. Then scan using that interface:

bash
# Example — adjust interface names to match your setup
sudo arp-scan -I eth0.20 192.168.20.0/24
sudo arp-scan -I eth0.30 192.168.30.0/24
If this is a Omada/TP-Link gateway (looks like it from the UI), the VLAN interfaces might be named differently — br0, br-vlan20, etc. The ip -br addr output will tell you exactly what's available and which subnet is bound to which interface.

ekku@gateway
:
~ $
 ip -br addr
lo               
UNKNOWN
127.0.0.1
/8
::1
/128
eth0             
UP             
192.168.1.105
/24
fe80::f437:1bc7:5f6a:c9ba
/64
br-1a59278d74db  
DOWN           
172.19.0.1
/16
docker0          
DOWN           
172.17.0.1
/16
br-427f20c0c8bf  
UP             
172.18.0.1
/16
fe80::b4f0:12ff:fed6:644
/64
vethbe01932@if2  
UP             
fe80::748e:61ff:fe8a:a83c
/64
vethbce705b@if2  
UP             
fe80::9416:68ff:fe6c:60b5
/64
vethf62ac7c@if2  
UP             
fe80::9418:48ff:fe56:2a1c
/64
vethfcb885e@if2  
UP             
fe80::78b2:38ff:fe8a:124c
/64
ekku@gateway
:
~ $

Show more
1:30 PM
Yeah, that confirms it — there are no VLAN interfaces on this box. Your gateway (192.168.1.105) is just a regular host on the MGMT subnet, not the router doing the inter-VLAN routing.

The device at 192.168.1.1 is almost certainly your Omada router/gateway that owns all those VLAN interfaces. ARP scans for the other subnets would need to be run from a device that's actually on those VLANs, or from the router itself (if it gives you shell access).

Your options:

From a device on each VLAN — SSH into a Pi or machine that's on VLAN 20/30 and run arp-scan --localnet from there.

From the Omada router — if it has SSH enabled and a usable shell, you could run arp-scan (or at least arp -a / check the ARP table) directly on it. Though many Omada devices have a pretty locked-down BusyBox shell.

From this gateway box using nmap — unlike ARP, routed ICMP/TCP can cross subnets since 192.168.1.1 will route for you:

bash
nmap -sn 192.168.20.0/24
nmap -sn 192.168.30.0/24
This won't give you MAC addresses (since the traffic is routed, not L2), but it'll tell you which IPs are alive on those subnets. That's probably the quickest win from where you are right now.

