/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type Lang = "en" | "ar";
export type Dialect = "ar" | "eg" | "lev" | "iq";

export interface Replies {
    en: string[];
    ar: string[];
    eg?: string[];
    lev?: string[];
    iq?: string[];
}

export interface Rule {
    en?: RegExp;
    ar?: RegExp;
    generic?: boolean;
    replies: Replies;
}
