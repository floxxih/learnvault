import { Router } from "express"

import {
	getScholarsLeaderboard,
	getScholarProfile,
} from "../controllers/scholars.controller"

export const scholarsRouter = Router()

scholarsRouter.get("/scholars/leaderboard", (req, res) => {
	void getScholarsLeaderboard(req, res)
})

scholarsRouter.get("/scholars/:address", (req, res) => {
	void getScholarProfile(req, res)
})
