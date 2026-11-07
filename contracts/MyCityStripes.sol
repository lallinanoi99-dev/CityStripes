// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title My City Stripes
/// @notice Stamp a city's warming stripes on BOT Chain and make a climate pledge with weekly check-ins.
/// No tokens, no payments, no admin. Only city summaries and pledges are stored — never personal data.
contract MyCityStripes {
    struct CityStamp {
        address by;          // first stamper
        string city;
        string country;
        int32 latE2;         // latitude  × 100 (rounded to 0.01°)
        int32 lonE2;         // longitude × 100
        uint16 fromYear;
        uint16 toYear;
        int16 warmingE2;     // last-10-years average minus 1951–1980 average, °C × 100
        bytes32 dataHash;    // SHA-256 of the yearly values (see README)
        uint32 pledges;
        uint64 at;           // first stamp time
        uint32 stamps;       // how many wallets stamped this city
        bytes stripes;       // one int8 per year: anomaly vs 1951–1980 in 0.1 °C (clamped ±12.7)
    }

    struct Pledge {
        address by;
        bytes32 cityKey;
        uint8 kind;          // 0–4 preset pledges, 5 = your own text
        string text;
        uint8 durationWeeks;         // 4, 8 or 12
        uint8 checkIns;
        uint32 lastWeek;     // block.timestamp / 1 weeks of the last check-in
        uint64 at;
    }

    struct StampInput {
        string city;
        string country;
        int32 latE2;
        int32 lonE2;
        uint16 fromYear;
        uint16 toYear;
        int16 warmingE2;
        bytes32 dataHash;
        bytes stripes;
    }

    uint8 public constant KIND_OWN = 5;
    uint16 public constant FIRST_YEAR = 1940;

    mapping(bytes32 => CityStamp) private _cities;
    mapping(bytes32 => mapping(address => bool)) public hasStamped;
    bytes32[] public cityList;

    mapping(uint256 => Pledge) private _pledges; // ids start at 1
    uint256 public pledgeCount;
    uint256 public checkInCount;
    mapping(address => uint256[]) private _pledgesOf;
    mapping(bytes32 => uint256[]) private _pledgesForCity;

    event CityStamped(bytes32 indexed key, address indexed by, int16 warmingE2);
    event Pledged(uint256 indexed id, address indexed by, bytes32 indexed cityKey, uint8 kind);
    event CheckedIn(uint256 indexed id, uint32 week, uint8 count);

    error BadName();
    error BadCoordinates();
    error BadYears();
    error BadWarming();
    error BadHash();
    error BadStripes();
    error AlreadyStamped();
    error UnknownCity();
    error BadKind();
    error BadText();
    error BadWeeks();
    error UnknownPledge();
    error NotYourPledge();
    error AlreadyCheckedIn();
    error PledgeComplete();

    // ------------------------------------------------------------------ cities

    function cityKey(int32 latE2, int32 lonE2) public pure returns (bytes32) {
        return keccak256(abi.encode(latE2, lonE2));
    }

    /// @notice The calendar year of the current block (UTC, good to within a day around New Year).
    function currentYear() public view returns (uint16) {
        return uint16(1970 + (block.timestamp * 400) / (146097 days));
    }

    /// @notice First stamp creates the city. Later stamps by other wallets add +1 to `stamps`.
    /// Newer data (a later `toYear`) replaces the stored summary; pledges and stamp counts are kept.
    function stampCity(StampInput calldata s) external returns (bytes32 key) {
        _check(s);
        key = cityKey(s.latE2, s.lonE2);
        CityStamp storage c = _cities[key];
        bool isNew = c.at == 0;
        bool newer = !isNew && s.toYear > c.toYear;
        bool firstByYou = !hasStamped[key][msg.sender];
        if (!isNew && !newer && !firstByYou) revert AlreadyStamped();

        if (isNew) {
            c.by = msg.sender;
            c.at = uint64(block.timestamp);
            c.latE2 = s.latE2;
            c.lonE2 = s.lonE2;
            cityList.push(key);
        }
        if (isNew || newer) {
            c.city = s.city;
            c.country = s.country;
            c.fromYear = s.fromYear;
            c.toYear = s.toYear;
            c.warmingE2 = s.warmingE2;
            c.dataHash = s.dataHash;
            c.stripes = s.stripes;
        }
        if (firstByYou) {
            hasStamped[key][msg.sender] = true;
            c.stamps += 1;
        }
        emit CityStamped(key, msg.sender, c.warmingE2);
    }

    function _check(StampInput calldata s) private view {
        uint256 nameLen = bytes(s.city).length;
        if (nameLen == 0 || nameLen > 64 || bytes(s.country).length > 64) revert BadName();
        if (s.latE2 < -9000 || s.latE2 > 9000 || s.lonE2 < -18000 || s.lonE2 > 18000) revert BadCoordinates();
        if (s.fromYear < FIRST_YEAR || s.toYear <= s.fromYear || s.toYear >= currentYear()) revert BadYears();
        if (s.warmingE2 < -1000 || s.warmingE2 > 1000) revert BadWarming();
        if (s.dataHash == bytes32(0)) revert BadHash();
        if (s.stripes.length != uint256(s.toYear - s.fromYear) + 1) revert BadStripes();
    }

    function getCity(bytes32 key) external view returns (CityStamp memory) {
        if (_cities[key].at == 0) revert UnknownCity();
        return _cities[key];
    }

    function cityCount() external view returns (uint256) {
        return cityList.length;
    }

    /// @notice A page of cities in stamp order.
    function getCities(uint256 from, uint256 count) external view returns (bytes32[] memory keys, CityStamp[] memory list) {
        uint256 n = cityList.length;
        uint256 end = from + count > n ? n : from + count;
        uint256 len = from < end ? end - from : 0;
        keys = new bytes32[](len);
        list = new CityStamp[](len);
        for (uint256 i = 0; i < len; i++) {
            keys[i] = cityList[from + i];
            list[i] = _cities[keys[i]];
        }
    }

    // ------------------------------------------------------------------ pledges

    function makePledge(bytes32 key, uint8 kind, string calldata text, uint8 durationWeeks) external returns (uint256 id) {
        CityStamp storage c = _cities[key];
        if (c.at == 0) revert UnknownCity();
        if (kind > KIND_OWN) revert BadKind();
        uint256 len = bytes(text).length;
        if (kind == KIND_OWN ? (len == 0 || len > 100) : len != 0) revert BadText();
        if (durationWeeks != 4 && durationWeeks != 8 && durationWeeks != 12) revert BadWeeks();

        id = ++pledgeCount;
        _pledges[id] = Pledge(msg.sender, key, kind, text, durationWeeks, 0, 0, uint64(block.timestamp));
        _pledgesOf[msg.sender].push(id);
        _pledgesForCity[key].push(id);
        c.pledges += 1;
        emit Pledged(id, msg.sender, key, kind);
    }

    /// @notice Once per calendar week (block.timestamp / 1 weeks), owner only, up to `durationWeeks` check-ins.
    function checkIn(uint256 id) external {
        Pledge storage p = _pledges[id];
        if (p.at == 0) revert UnknownPledge();
        if (p.by != msg.sender) revert NotYourPledge();
        if (p.checkIns >= p.durationWeeks) revert PledgeComplete();
        uint32 week = currentWeek();
        if (p.checkIns > 0 && p.lastWeek == week) revert AlreadyCheckedIn();
        p.lastWeek = week;
        p.checkIns += 1;
        checkInCount += 1;
        emit CheckedIn(id, week, p.checkIns);
    }

    function currentWeek() public view returns (uint32) {
        return uint32(block.timestamp / 1 weeks);
    }

    function getPledge(uint256 id) public view returns (Pledge memory) {
        if (_pledges[id].at == 0) revert UnknownPledge();
        return _pledges[id];
    }

    function pledgesOf(address who) external view returns (uint256[] memory ids, Pledge[] memory list) {
        return _list(_pledgesOf[who]);
    }

    function pledgesForCity(bytes32 key) external view returns (uint256[] memory ids, Pledge[] memory list) {
        return _list(_pledgesForCity[key]);
    }

    function _list(uint256[] storage src) private view returns (uint256[] memory ids, Pledge[] memory list) {
        ids = src;
        list = new Pledge[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) list[i] = _pledges[ids[i]];
    }

    function stats() external view returns (uint256 cities, uint256 pledges, uint256 checkIns) {
        return (cityList.length, pledgeCount, checkInCount);
    }
}
