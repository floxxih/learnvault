import { type Request, type Response } from "express"

import { pool } from "../db/index"
import { stellarContractService } from "../services/stellar-contract.service"

function parsePositiveInt(value: unknown, fallback: number): number {
	if (typeof value !== "string") return fallback
	const parsed = Number.parseInt(value, 10)
	if (Number.isNaN(parsed) || parsed < 1) return fallback
	return parsed
}

export async function getScholarsLeaderboard(
	req: Request,
	res: Response,
): Promise<void> {
	const page = parsePositiveInt(req.query.page, 1)
	const limit = Math.min(parsePositiveInt(req.query.limit, 50), 100)
	const search = typeof req.query.search === "string" ? req.query.search.trim() : ""
	const offset = (page - 1) * limit

	const whereClause = search ? "WHERE address ILIKE $1" : ""
	const whereValues: unknown[] = search ? [`%${search}%`] : []

	try {
		const totalResult = await pool.query(
			`SELECT COUNT(*)::int AS total FROM scholar_balances ${whereClause}`,
			whereValues,
		)
		const total = Number(totalResult.rows[0]?.total ?? 0)

		const rankingsValues = [...whereValues, limit, offset]
		const rankingsResult = await pool.query(
			`SELECT
				ROW_NUMBER() OVER (ORDER BY lrn_balance DESC, address ASC) + $${whereValues.length + 2} AS rank,
				address,
				lrn_balance,
				courses_completed
			 FROM scholar_balances
			 ${whereClause}
			 ORDER BY lrn_balance DESC, address ASC
			 LIMIT $${whereValues.length + 1}
			 OFFSET $${whereValues.length + 2}`,
			rankingsValues,
		)

		const currentAddress = req.walletAddress
		let yourRank: number | null = null

		if (currentAddress) {
			const rankResult = await pool.query(
				`SELECT rank FROM (
					SELECT ROW_NUMBER() OVER (ORDER BY lrn_balance DESC, address ASC) AS rank, address
					FROM scholar_balances
				) ranked
				WHERE address = $1`,
				[currentAddress],
			)
			yourRank = rankResult.rows[0]?.rank ?? null
		}

		res.status(200).json({
			rankings: rankingsResult.rows,
			total,
			your_rank: yourRank,
		})
	} catch {
		res.status(500).json({ error: "Failed to fetch scholars leaderboard" })
	}
}

export async function getScholarProfile(
	req: Request,
	res: Response,
): Promise<void> {
	const { address } = req.params

	if (!address) {
		res.status(400).json({ error: "Scholar address is required" })
		return
	}

	try {
		// 1. Fetch on-chain data
		const lrn_balance = await stellarContractService.getLearnTokenBalance(address)
		const enrolled_courses = await stellarContractService.getEnrolledCourses(address)
		const credentials = await stellarContractService.getScholarCredentials(address)

		// 2. Fetch database data
		const milestoneStatsResult = await pool.query(
			`SELECT 
				COUNT(*) FILTER (WHERE status = 'approved') AS completed,
				COUNT(*) FILTER (WHERE status = 'pending') AS pending
			 FROM milestone_reports
			 WHERE scholar_address = $1`,
			[address],
		)
		const stats = milestoneStatsResult.rows[0]

		const joinedAtResult = await pool.query(
			`SELECT MIN(enrolled_at) AS joined_at
			 FROM enrollments
			 WHERE learner_address = $1`,
			[address],
		)
		// Fallback to current time if no enrollments yet
		const joinedAt = joinedAtResult.rows[0]?.joined_at ?? new Date().toISOString()

		res.status(200).json({
			address,
			lrn_balance,
			enrolled_courses,
			completed_milestones: Number(stats?.completed ?? 0),
			pending_milestones: Number(stats?.pending ?? 0),
			credentials,
			joined_at: joinedAt,
		})
	} catch (error) {
		console.error("[scholars] Error fetching scholar profile:", error)
		res.status(500).json({ error: "Failed to fetch scholar profile" })
	}
}
