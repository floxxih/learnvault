import { Button, Card, Code, Icon, Input } from "@stellar/design-system"
import { useState } from "react"
import { useWallet } from "../hooks/useWallet"
import styles from "./GuessTheNumber.module.css"

type GuessClient = {
	guess: (
		args: { a_number: bigint; guesser: string },
		options: { publicKey: string },
	) => Promise<{
		signAndSend: (options: { signTransaction: unknown }) => Promise<{
			result: {
				isErr: () => boolean
				unwrapErr: () => unknown
				unwrap: () => boolean
			}
		}>
	}>
}

const generatedContractModules = import.meta.glob("../contracts/*.ts")
const guessClientModuleLoader = Object.entries(generatedContractModules).find(
	([path]) => path.endsWith("/guess_the_number.ts"),
)?.[1]

const loadGuessClient = async (): Promise<GuessClient | null> => {
	if (!guessClientModuleLoader) {
		return null
	}

	const module = await guessClientModuleLoader()

	if (
		typeof module === "object" &&
		module !== null &&
		"default" in module &&
		module.default
	) {
		return module.default as GuessClient
	}

	return null
}

const missingClientMessage =
	"Guess The Number bindings are missing. Run `stellar scaffold watch --build-clients` to generate the contract client."

export const GuessTheNumber = () => {
	const { address, updateBalances, signTransaction } = useWallet()
	const [result, setResult] = useState<
		"idle" | "loading" | "success" | "failure"
	>("idle")
	const [errorMessage, setErrorMessage] = useState<string | null>(null)

	const submitGuess = async (formData: FormData) => {
		setErrorMessage(null)

		if (!address) {
			setErrorMessage("Connect to your wallet in order to guess.")
			setResult("failure")
			return
		}

		const guess = formData.get("guess")
		if (typeof guess !== "string" || !guess) {
			setErrorMessage("Enter a number from 1 to 10 before submitting.")
			setResult("failure")
			return
		}

		setResult("loading")

		try {
			const game = await loadGuessClient()
			if (!game) {
				setErrorMessage(missingClientMessage)
				setResult("failure")
				return
			}

			const tx = await game.guess(
				{ a_number: BigInt(guess), guesser: address },
				{ publicKey: address },
			)
			const { result } = await tx.signAndSend({ signTransaction })

			if (result.isErr()) {
				const error = result.unwrapErr()
				console.error(error)
				setErrorMessage(String(error))
				setResult("failure")
				return
			}

			const isCorrectGuess = result.unwrap()
			setResult(isCorrectGuess ? "success" : "failure")

			if (!isCorrectGuess) {
				setErrorMessage("Incorrect guess. Try again!")
				return
			}

			await updateBalances()
		} catch (error) {
			console.error(error)
			setErrorMessage(
				error instanceof Error ? error.message : "Unable to submit your guess.",
			)
			setResult("failure")
		}
	}

	const reset = () => {
		setResult("idle")
		setErrorMessage(null)
	}

	return (
		<div className={styles.GuessTheNumber}>
			<form action={submitGuess}>
				<Input
					placeholder="Guess a number from 1 to 10!"
					id="guess"
					name="guess"
					fieldSize="lg"
					isError={result === "failure"}
					error={result === "failure" ? (errorMessage ?? undefined) : undefined}
					onChange={reset}
				/>

				<Button
					type="submit"
					disabled={result === "loading"}
					variant="primary"
					size="lg"
				>
					Submit
				</Button>
			</form>

			{result === "success" && (
				<Card>
					<Icon.CheckCircle className={styles.success} />
					<p>
						You got it! Play again by calling <Code size="md">reset</Code> in
						the Contract Explorer.
					</p>
				</Card>
			)}
			{result === "failure" && (
				<Card>
					<Icon.XCircle className={styles.failure} />
					<p>{errorMessage ?? "Incorrect guess. Try again!"}</p>
				</Card>
			)}
		</div>
	)
}
