import { Canvas } from '@zemn.me/math/canvas/element'
import { Drawable3D } from '@zemn.me/math/canvas'
import * as Particle from '@zemn.me/math/sim/particle'
import * as Unit from '@zemn.me/math/sim/unit'
import * as Homog from '@zemn.me/math/homog'
import * as Cart from '@zemn.me/math/cartesian'
import * as Shape from '@zemn.me/math/shape'
import * as Vec from '@zemn.me/math/vec'
import * as Matrix from '@zemn.me/math/matrix'
import React from 'react'
import { request } from 'https'

class Raindrop implements Particle.Particle<3> {
	public mass = Unit.g * 0.1
	public length = Unit.cm * 10
	public speed: Vec.Vector<3> = [0, 0, 0] as const
	constructor(public displacement: Vec.Vector<3>) {}

	get top() {
		return this.displacement
	}
	get topHomog() {
		return Homog.fromCart(Matrix.fromVec(this.top))
	}
	get bottom() {
		return Vec.add(this.displacement, [0, this.length, 0] as const)
	}
	get bottomHomog() {
		return Homog.fromCart(Matrix.fromVec(this.bottom))
	}

	lines3D(): [Homog.Line3D] {
		return [[this.topHomog, this.bottomHomog]]
	}
}

class Rain implements Drawable3D {
	private raindrops: Raindrop[] = []
	public size: number = 10
	private fields = [() => [0, -0.003]] as const

	private raindropPos() {
		let { size } = this

		size /= 2
		const xMin = -size
		const xMax = size
		const yMin = -size
		const yMax = size

		const x = xMin + (xMax - xMin) * Math.random()
		const y = size
		const z = yMin + (yMax - yMin) * Math.random()

		return [x, y, z] as const
	}

	private randomVel() {
		return (Math.random() > 0.5 ? -1 : 1) * 0.1 + Math.random() * 1
	}

	private addRainDrop() {
		const raindrop = new Raindrop(this.raindropPos())
		raindrop.speed = [this.randomVel(), 0, this.randomVel()] as const
		this.raindrops.push(raindrop)
	}

	private spawnsPerSecond = 1
	private needToSpawn = 0

	get ceil() {
		return this.size / 2
	}

	simulate(timeDelta: number) {
		for (const raindrop of this.raindrops) {
			Particle.simulate(raindrop, timeDelta, ...this.fields)
		}

		const newRaindrops = this.raindrops.filter(
			({ bottom: [bx, by, bz] }) => by > -this.ceil,
		)

		this.needToSpawn += this.raindrops.length - newRaindrops.length

		this.raindrops = newRaindrops

		if (this.needToSpawn > 0) {
			const baseChanceToSpawn = this.spawnsPerSecond / timeDelta

			if (Math.random() < baseChanceToSpawn) this.addRainDrop()
			this.needToSpawn--
		}
	}

	addRainDrops(howMany: number) {
		this.needToSpawn += howMany
	}

	lines3D(): Homog.Line3D[] {
		return [
			...this.raindrops.map((rd) => rd.lines3D()).flat(1),
			...new Shape.Cube(this.size).lines3D(),
		]
	}
}

export default function RenderTest() {
	const [a, setA] = React.useState<number>(3000)
	const [b, setB] = React.useState<number>(-9735)
	const [c, setC] = React.useState<number>(-7965)
	const [rainSim, setRainSim] = React.useState<{ drawing: Rain }>(() => {
		console.log('starting rain sim')
		const sim = new Rain()
		sim.addRainDrops(1000)
		return { drawing: sim }
	})

	const onAChange = React.useCallback(
		(e: { target: { value: string } }) => {
			const n = e.target.value
			setA(() => +n)
		},
		[setA],
	)

	const onBChange = React.useCallback(
		(e: { target: { value: string } }) => {
			const n = e.target.value
			setB(() => +n)
		},
		[setB],
	)

	const onCChange = React.useCallback(
		(e: { target: { value: string } }) => {
			const n = e.target.value
			setC(() => +n)
		},
		[setC],
	)

	const [last, setLast] = React.useState<number | undefined>()

	React.useEffect(() => {
		let hnd: number
		const onAnimationFrame = (time: number) => {
			const elapsed = (time - (last ?? time)) / 1000
			rainSim.drawing.simulate(elapsed)
			setLast(() => {
				hnd = requestAnimationFrame(onAnimationFrame)
				return time
			})
		}
		hnd = requestAnimationFrame(onAnimationFrame)
		return () => cancelAnimationFrame(hnd)
	}, [last, setLast])

	const space2d = new Shape.Project(
		new Shape.Translate3D(rainSim.drawing, [
			[a / 1000],
			[b / 1000],
			[c / 1000],
			[1],
		] as const),
	)

	return (
		<>
			<h1>A Cube!</h1>
			<input
				type="range"
				min="-100000"
				max="100000"
				value={b}
				onChange={onBChange}
			/>
			<input
				type="range"
				min="-100000"
				max="100000"
				value={c}
				onChange={onCChange}
			/>
			<input
				type="range"
				min="-100000"
				max="100000"
				value={a}
				onChange={onAChange}
			/>
			<Canvas draw={space2d} />
			<h1>A Square!</h1>
			<Canvas draw={new Shape.Square(10)} />
		</>
	)
}
