export const LS = {
    auth: "auth_token",
    selectedUser: "selected_user",
    weeklyPlanMoe: "weekly_plan_Moe",
    weeklyPlanTrish: "weekly_plan_Trish",
    lastDrinkTypeMoe: "last_drink_type_Moe",
    lastDrinkTypeTrish: "last_drink_type_Trish"
};

export const DEFAULT_WEEKLY_PLAN = 14;

export const DAY_MS = 24 * 60 * 60 * 1000;

export const DOW_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const DOW_ALIASES = {
    sun: 0, sunday: 0,
    mon: 1, monday: 1,
    tue: 2, tues: 2, tuesday: 2,
    wed: 3, weds: 3, wednesday: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4,
    fri: 5, friday: 5,
    sat: 6, saturday: 6
};

export const monthMap = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8, sept: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11
};

export const numberWords = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
};

export const VALID_DRINK_TYPES = new Set(["wine", "beer", "cocktail", "other"]);

export const NY_TZ = "America/New_York";
export const NY_DOW_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
