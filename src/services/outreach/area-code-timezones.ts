/**
 * NANP area code → IANA time zone, the fallback when a call recipient has no
 * stored time zone. Area codes that straddle a zone line go to the zone most
 * of their callers live in; a stored time zone always wins over this table.
 *
 * @module services/outreach/area-code-timezones
 */

const ZONES: Record<string, string> = {
  'America/New_York':
    '201 202 203 207 212 215 216 220 223 229 231 234 239 240 248 252 260 267 269 272 276 283 ' +
    '301 302 304 305 313 315 317 321 326 330 332 339 347 351 352 363 380 386 401 404 407 410 ' +
    '412 413 419 423 434 436 440 443 445 463 470 472 475 478 484 502 508 513 516 517 518 540 ' +
    '551 561 567 570 571 574 582 585 586 603 606 607 609 610 614 616 617 631 640 646 656 667 ' +
    '678 679 680 681 689 703 704 706 716 717 718 724 727 732 734 740 743 754 757 762 765 770 ' +
    '771 772 774 781 786 802 803 804 810 812 813 814 826 828 835 838 839 843 845 848 854 856 ' +
    '857 859 860 862 863 864 865 878 904 906 908 910 912 914 917 919 929 930 934 937 941 943 ' +
    '947 948 954 959 973 978 980 984 989 ' +
    // Ontario and Quebec
    '226 249 263 289 343 354 365 367 382 416 418 437 438 450 468 514 519 548 579 581 613 647 ' +
    '683 705 742 753 807 819 873 905 942',
  'America/Chicago':
    '205 210 214 217 218 219 224 225 228 251 254 256 262 270 274 281 309 312 314 316 318 319 ' +
    '320 325 327 331 334 337 346 353 361 364 402 405 409 414 417 430 432 447 448 464 469 479 ' +
    '501 504 507 512 515 531 534 539 557 563 572 573 580 601 605 608 612 615 618 620 629 630 ' +
    '636 641 651 659 660 662 682 701 708 712 713 715 726 730 731 737 763 769 773 779 785 806 ' +
    '815 816 817 830 832 847 850 861 870 872 901 903 913 918 920 931 936 938 940 945 952 956 ' +
    '972 975 979 985 ' +
    // Manitoba
    '204 431 584',
  'America/Regina': '306 474 639',
  'America/Denver':
    '208 303 307 308 385 406 435 505 575 719 720 801 915 970 983 986 368 403 587 780 825',
  'America/Phoenix': '480 520 602 623 928',
  'America/Los_Angeles':
    '206 209 213 253 279 310 323 341 350 360 369 408 415 424 425 442 458 503 509 510 530 541 ' +
    '559 562 564 619 626 628 650 657 661 669 702 707 714 725 747 760 775 805 818 820 831 840 ' +
    '858 909 916 925 949 951 971 ' +
    // British Columbia
    '236 250 257 604 672 778',
  'America/Anchorage': '907',
  'Pacific/Honolulu': '808',
  'America/Halifax': '428 506 782 902',
  'America/St_Johns': '709 879',
  'America/Puerto_Rico': '340 787 939',
};

const BY_AREA_CODE = new Map<string, string>();
for (const [zone, codes] of Object.entries(ZONES)) {
  for (const code of codes.split(' ')) BY_AREA_CODE.set(code, zone);
}

/** Time zone of a North American (+1) phone number's area code, if known. */
export function timezoneFromPhone(phone: string | undefined): string | undefined {
  const digits = (phone ?? '').replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return undefined;
  return BY_AREA_CODE.get(national.slice(0, 3));
}
