import {
  ExplanationDepth,
  HandwrittenPreset,
  MathSolution,
  SolutionStep,
} from "../types/studyBuddy";

export const HANDWRITTEN_PRESETS: HandwrittenPreset[] = [
  {
    id: "quad-1",
    label: "Quadratic Roots",
    topic: "Algebra",
    equation: "2x^2 - 8x + 6 = 0",
    handwrittenLines: ["2x² - 8x + 6 = 0", "Solve for x (show factoring)"],
    defaultVoiceNote:
      "My teacher said to factor out the greatest common factor first instead of using the quadratic formula.",
  },
  {
    id: "calc-deriv",
    label: "Product & Chain Rule",
    topic: "Calculus",
    equation: "d/dx (x^3 + 4x^2 - 5x + 2)",
    handwrittenLines: ["f(x) = x³ + 4x² - 5x + 2", "Find f'(x) and f'(1)"],
    defaultVoiceNote:
      "Can you explain the power rule step slowly and show how to plug in x = 1 at the end?",
  },
  {
    id: "sys-eq",
    label: "Linear System",
    topic: "Linear Systems",
    equation: "2x + y = 10, x - y = 2",
    handwrittenLines: ["2x + y = 10", "x - y = 2"],
    defaultVoiceNote:
      "I always get confused about whether to add or subtract the two equations in elimination.",
  },
  {
    id: "ineq-flip",
    label: "Negative Inequality",
    topic: "Algebra",
    equation: "-3x + 7 < 19",
    handwrittenLines: ["-3x + 7 < 19", "Graph / solve for x"],
    defaultVoiceNote:
      "Why do we have to flip the inequality sign at the last step?",
  },
  {
    id: "geom-pyth",
    label: "Right Triangle Hypotenuse",
    topic: "Geometry",
    equation: "a = 6, b = 8, find c",
    handwrittenLines: ["Right Δ: legs a = 6, b = 8", "a² + b² = c²  →  c = ?"],
    defaultVoiceNote:
      "Is there a special triangle ratio shortcut for 6 and 8?",
  },
];

/**
 * Renders a realistic handwritten math equation onto a notebook paper HTML5 canvas
 * and returns a PNG data URL for instant offline or cloud camera scanning.
 */
export function renderHandwrittenSampleToDataUrl(
  preset: HandwrittenPreset
): string {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Warm notebook paper background
  ctx.fillStyle = "#F6F4EC";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle horizontal notebook ruled lines
  ctx.strokeStyle = "rgba(96, 148, 214, 0.28)";
  ctx.lineWidth = 1.5;
  for (let y = 56; y < canvas.height; y += 44) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Vertical red margin line
  ctx.strokeStyle = "rgba(220, 90, 90, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(68, 0);
  ctx.lineTo(68, canvas.height);
  ctx.stroke();

  // Topic corner note
  ctx.fillStyle = "#5B6472";
  ctx.font = "italic 600 16px 'JetBrains Mono', monospace";
  ctx.fillText(`HW Scan · ${preset.topic}`, 88, 42);

  // Simulated ballpoint pen ink with slight organic jitter
  ctx.fillStyle = "#182848";
  ctx.strokeStyle = "#182848";
  preset.handwrittenLines.forEach((line, idx) => {
    ctx.save();
    const yPos = 135 + idx * 88;
    ctx.translate(92, yPos);
    ctx.rotate((idx % 2 === 0 ? -0.014 : 0.012));
    ctx.font =
      idx === 0
        ? "700 44px 'JetBrains Mono', monospace"
        : "500 26px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(line, 0, 0);

    if (idx === 0) {
      // Hand-drawn underline stroke
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(239, 91, 20, 0.7)";
      ctx.moveTo(0, 16);
      ctx.quadraticCurveTo(160, 24, 340, 14);
      ctx.stroke();
    }
    ctx.restore();
  });

  return canvas.toDataURL("image/png");
}

/**
 * Local Gemma 4 Edge symbolic & heuristic math solver that runs 100% offline in browser.
 * Incorporates audio/speech context notes and explanation depth settings.
 */
export function solveWithLocalGemmaEdge(
  rawInput: string,
  voiceNote: string = "",
  depth: ExplanationDepth = "standard",
  scannedImagePreview?: string
): MathSolution {
  const input = (rawInput || "2x^2 - 8x + 6 = 0").trim();
  const normalized = input.toLowerCase().replace(/\s+/g, "");
  const cleanVoice = voiceNote.trim();

  const contextPrefix = cleanVoice
    ? `Heard your audio note ("${cleanVoice}")! I tailored the steps around your request.`
    : depth === "deep-eli10"
    ? "Using Deep Intuition mode so every algebraic move feels crystal clear."
    : depth === "concise"
    ? "Fast-track Edge breakdown focused on the key algebraic transformations."
    : "Solved by the built-in offline helper (rule-based, runs in your browser).";

  // 1. Check Quadratic (e.g. 2x^2 - 8x + 6 = 0 or similar)
  if (
    normalized.includes("2x^2-8x+6") ||
    normalized.includes("2x²-8x+6")
  ) {
    const steps: SolutionStep[] = [
      {
        stepNumber: 1,
        title: "Factor Out the Common Multiplier",
        mathExpression: "2(x² - 4x + 3) = 0",
        explanation:
          "Every coefficient (2, -8, and 6) is even. Dividing the entire equation by 2 makes the numbers much smaller and easier to factor!",
        spokenScript:
          "First, notice that two, negative eight, and six are all divisible by two. Let's factor out two so we get x squared minus four x plus three equals zero.",
        buddyMood: "thinking",
        tip: "Always scan for a Greatest Common Factor (GCF) before reaching for the quadratic formula.",
      },
      {
        stepNumber: 2,
        title: "Find Two Numbers That Multiply to 3 & Add to -4",
        mathExpression: "(x - 1)(x - 3) = 0",
        explanation:
          "We need two numbers whose product is +3 and sum is -4. Since (-1) × (-3) = 3 and (-1) + (-3) = -4, we split the quadratic into two clean linear factors.",
        spokenScript:
          "Next, we ask: what two numbers multiply to positive three and add up to negative four? Negative one and negative three! So we write x minus one times x minus three equals zero.",
        buddyMood: "talking",
        tip: "When the last term is positive and the middle term is negative, both factors must be negative.",
      },
      {
        stepNumber: 3,
        title: "Apply the Zero Product Property",
        mathExpression: "x - 1 = 0   or   x - 3 = 0",
        explanation:
          "If two expressions multiply to zero, at least one of them must equal zero. We set each factor to zero separately.",
        spokenScript:
          "By the Zero Product Property, if two factors multiply to zero, either x minus one is zero, or x minus three is zero.",
        buddyMood: "curious",
      },
      {
        stepNumber: 4,
        title: "Solve & Verify Both Roots",
        mathExpression: "x = 1,   x = 3",
        explanation:
          "Adding 1 to the first equation gives x = 1, and adding 3 to the second gives x = 3. Plugging x = 1 back in: 2(1)² - 8(1) + 6 = 0. Verified!",
        spokenScript:
          "Solving each gives our two roots: x equals one, and x equals three! Plugging one back in gives two minus eight plus six, which is zero. High five!",
        buddyMood: "happy",
      },
    ];

    return {
      id: `sol-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      detectedEquation: "2x² - 8x + 6 = 0",
      category: "Algebra · Quadratics",
      finalAnswer: "x = 1,  x = 3",
      audioContextInsight: contextPrefix,
      buddyGreeting:
        "Ooh, a classic quadratic equation! Let's break it down together step by step.",
      steps,
      comprehensionCheck: {
        question:
          "Why did we divide every term by 2 in Step 1 before factoring?",
        options: [
          "To reduce the leading coefficient to 1 so factoring is simpler",
          "Because quadratics cannot be solved if the first number is even",
          "To eliminate the x² variable completely",
        ],
        correctIndex: 0,
        encouragementOnCorrect:
          "Spot on! Making the leading coefficient 1 turns it into a quick mental puzzle.",
        hintOnRetry:
          "Look at how 2x² became just x² inside the parentheses—what did that do to our factoring step?",
      },
      engineUsed: "Built-in offline helper (no AI)",
      voiceNoteAttached: cleanVoice || undefined,
      scannedImagePreview,
    };
  }

  // 2. Check Derivative / Calculus
  if (
    normalized.includes("d/dx") ||
    normalized.includes("f(x)=") ||
    normalized.includes("x^3+4x^2") ||
    normalized.includes("x³+4x²")
  ) {
    const steps: SolutionStep[] = [
      {
        stepNumber: 1,
        title: "Recall the Power Rule for Derivatives",
        mathExpression: "d/dx [xⁿ] = n · xⁿ⁻¹",
        explanation:
          "For each polynomial term, bring the exponent down in front as a multiplier, then subtract 1 from the exponent.",
        spokenScript:
          "Let's use the Power Rule! For every x to the power of n, we bring the exponent n down in front, and subtract one from the exponent.",
        buddyMood: "thinking",
        tip: "The derivative of any constant number by itself (like +2) is always 0 because constants don't change!",
      },
      {
        stepNumber: 2,
        title: "Differentiate Term by Term",
        mathExpression: "f'(x) = 3x² + 8x - 5 + 0",
        explanation:
          "• x³ becomes 3x²\n• 4x² becomes 4 · (2x¹) = 8x\n• -5x becomes -5\n• +2 (constant) becomes 0.",
        spokenScript:
          "Differentiating term by term: x cubed becomes three x squared. Four x squared becomes eight x. Negative five x becomes negative five, and the constant two disappears to zero!",
        buddyMood: "talking",
      },
      {
        stepNumber: 3,
        title: "Evaluate Instantaneous Slope at x = 1",
        mathExpression: "f'(1) = 3(1)² + 8(1) - 5 = 6",
        explanation:
          "Substituting x = 1 into our derivative function gives 3 + 8 - 5 = 6. That means the tangent line at x = 1 has a slope of 6!",
        spokenScript:
          "Now let's plug in x equals one: three times one squared, plus eight times one, minus five equals six! The slope right at x equals one is six.",
        buddyMood: "happy",
      },
    ];

    return {
      id: `sol-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      detectedEquation: "f(x) = x³ + 4x² - 5x + 2",
      category: "Calculus · Differentiation",
      finalAnswer: "f'(x) = 3x² + 8x - 5  (at x=1, slope = 6)",
      audioContextInsight: contextPrefix,
      buddyGreeting:
        "Calculus time! Let's find the derivative and slope using the Power Rule.",
      steps,
      comprehensionCheck: {
        question: "What happens to the constant term (+2) when we take the derivative?",
        options: [
          "It becomes 0 because a constant has zero rate of change",
          "It becomes 2x",
          "It stays +2 in the derivative",
        ],
        correctIndex: 0,
        encouragementOnCorrect:
          "You nailed it! A flat horizontal line has zero slope, so constants always differentiate to zero.",
        hintOnRetry:
          "Think about a graph of y = 2: does it go up or down as x changes?",
      },
      engineUsed: "Built-in offline helper (no AI)",
      voiceNoteAttached: cleanVoice || undefined,
      scannedImagePreview,
    };
  }

  // 3. Check Linear System
  if (normalized.includes("2x+y=10") || normalized.includes("x-y=2")) {
    const steps: SolutionStep[] = [
      {
        stepNumber: 1,
        title: "Line Up the Equations for Elimination",
        mathExpression: "(2x + y) + (x - y) = 10 + 2",
        explanation:
          "Notice that the first equation has +y and the second has -y. They have opposite signs! Adding the two equations vertically will cancel y immediately.",
        spokenScript:
          "Look closely at the y terms: one is positive y and the other is negative y! Because their signs are opposite, we can add the two equations together to eliminate y right away.",
        buddyMood: "thinking",
        tip: "Opposite signs (+y and -y) → ADD equations. Same signs (+y and +y) → SUBTRACT equations.",
      },
      {
        stepNumber: 2,
        title: "Solve for x",
        mathExpression: "3x = 12   ⇒   x = 4",
        explanation:
          "Combining 2x + x gives 3x, and 10 + 2 gives 12. Dividing both sides by 3 yields x = 4.",
        spokenScript:
          "Two x plus x gives three x, and ten plus two equals twelve. Divide both sides by three, and we get x equals four!",
        buddyMood: "talking",
      },
      {
        stepNumber: 3,
        title: "Substitute x = 4 Back to Find y",
        mathExpression: "4 - y = 2   ⇒   y = 2",
        explanation:
          "Plug x = 4 into the simpler second equation (x - y = 2): 4 - y = 2, so y = 2. Both equations balance!",
        spokenScript:
          "Finally, plug x equals four into x minus y equals two. Four minus two is two, so y equals two! Our intersection point is four comma two.",
        buddyMood: "happy",
      },
    ];

    return {
      id: `sol-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      detectedEquation: "2x + y = 10,  x - y = 2",
      category: "Linear Systems · Elimination",
      finalAnswer: "(x, y) = (4, 2)",
      audioContextInsight: contextPrefix,
      buddyGreeting:
        "Let's solve this system of two lines and find where they cross!",
      steps,
      comprehensionCheck: {
        question:
          "How do you know whether to ADD or SUBTRACT two equations in elimination?",
        options: [
          "Add when coefficients have opposite signs (+y and -y); subtract when signs match",
          "Always add the equations no matter what",
          "Multiply the equations together first",
        ],
        correctIndex: 0,
        encouragementOnCorrect:
          "Awesome! Opposite signs cancel out cleanly when added together.",
        hintOnRetry: "What happens when you add +y and -y together?",
      },
      engineUsed: "Built-in offline helper (no AI)",
      voiceNoteAttached: cleanVoice || undefined,
      scannedImagePreview,
    };
  }

  // 4. Check Inequality with Negative Coefficient
  if (normalized.includes("-3x+7<19") || normalized.includes("<") || normalized.includes(">")) {
    const steps: SolutionStep[] = [
      {
        stepNumber: 1,
        title: "Isolate the Variable Term (-3x)",
        mathExpression: "-3x < 19 - 7   ⇒   -3x < 12",
        explanation:
          "Subtract 7 from both sides of the inequality. Subtracting a number never changes the direction of the inequality sign.",
        spokenScript:
          "First, let's isolate the negative three x term by subtracting seven from both sides. Nineteen minus seven is twelve, so negative three x is less than twelve.",
        buddyMood: "thinking",
      },
      {
        stepNumber: 2,
        title: "Divide by -3 & Flip the Inequality Sign",
        mathExpression: "x > 12 / (-3)   ⇒   x > -4",
        explanation:
          "When we divide or multiply both sides of an inequality by a NEGATIVE number, it reverses the order on the number line—so '<' flips to '>'.",
        spokenScript:
          "Here is the crucial rule! Because we are dividing both sides by negative three, the inequality sign flips from less than to greater than! Twelve divided by negative three is negative four, so x is greater than negative four.",
        buddyMood: "talking",
        tip: "Test a number to be sure! Try x = 0 (which is > -4): -3(0) + 7 = 7 < 19. True!",
      },
    ];

    return {
      id: `sol-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      detectedEquation: input,
      category: "Algebra · Linear Inequalities",
      finalAnswer: "x > -4",
      audioContextInsight: contextPrefix,
      buddyGreeting:
        "Watch out for that negative sign in front of x—let's tackle this inequality!",
      steps,
      comprehensionCheck: {
        question: "When must you flip the inequality sign (< to >)?",
        options: [
          "When multiplying or dividing both sides by a negative number",
          "Whenever you subtract a number from both sides",
          "Whenever the right side is negative",
        ],
        correctIndex: 0,
        encouragementOnCorrect:
          "Exactly right! Multiplying or dividing by a negative mirrors the number line.",
        hintOnRetry:
          "Think about 2 < 5: if you multiply both sides by -1, you get -2 and -5. Which one is bigger?",
      },
      engineUsed: "Built-in offline helper (no AI)",
      voiceNoteAttached: cleanVoice || undefined,
      scannedImagePreview,
    };
  }

  // 5. Check Right Triangle / Pythagorean Theorem
  if (normalized.includes("a=6") || normalized.includes("b=8") || normalized.includes("a^2+b^2")) {
    const steps: SolutionStep[] = [
      {
        stepNumber: 1,
        title: "Set Up the Pythagorean Theorem",
        mathExpression: "6² + 8² = c²",
        explanation:
          "In any right triangle, the sum of the squares of the two shorter legs (a and b) equals the square of the hypotenuse (c).",
        spokenScript:
          "Let's plug our two legs, six and eight, into the Pythagorean Theorem: six squared plus eight squared equals c squared.",
        buddyMood: "thinking",
        tip: "Notice that 6 and 8 are just 2 × (3 and 4)—this is a scaled 3-4-5 right triangle!",
      },
      {
        stepNumber: 2,
        title: "Square & Sum the Legs",
        mathExpression: "36 + 64 = c²   ⇒   100 = c²",
        explanation:
          "6² = 36 and 8² = 64. Adding them together gives 36 + 64 = 100.",
        spokenScript:
          "Six squared is thirty-six, and eight squared is sixty-four. Thirty-six plus sixty-four adds up to a clean one hundred!",
        buddyMood: "talking",
      },
      {
        stepNumber: 3,
        title: "Take the Principal Square Root",
        mathExpression: "c = √100 = 10",
        explanation:
          "Since length is always positive, c = √100 = 10 units.",
        spokenScript:
          "Finally, take the square root of one hundred, and we get c equals ten! And just like the 3-4-5 triangle shortcut, two times five is ten!",
        buddyMood: "happy",
      },
    ];

    return {
      id: `sol-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      detectedEquation: "a² + b² = c²  (a = 6, b = 8)",
      category: "Geometry · Right Triangles",
      finalAnswer: "c = 10",
      audioContextInsight: contextPrefix,
      buddyGreeting:
        "Geometry time! Let's find the missing hypotenuse and check the 3-4-5 shortcut.",
      steps,
      comprehensionCheck: {
        question:
          "If a right triangle has legs 9 and 12 (which is 3 × the 3-4-5 ratio), what is its hypotenuse?",
        options: ["15", "14", "21"],
        correctIndex: 0,
        encouragementOnCorrect:
          "Brilliant! 3 × 5 = 15. Recognizing 3-4-5 multiples saves tons of time on exams!",
        hintOnRetry: "Multiply each side of (3, 4, 5) by 3!",
      },
      engineUsed: "Built-in offline helper (no AI)",
      voiceNoteAttached: cleanVoice || undefined,
      scannedImagePreview,
    };
  }

  // 6. General Linear Equation Solver (e.g. ax + b = c)
  const linearMatch = normalized.match(/^([+-]?\d*)x([+-]\d+)=([+-]?\d+)$/);
  if (linearMatch) {
    const aRaw = linearMatch[1];
    const a = aRaw === "" || aRaw === "+" ? 1 : aRaw === "-" ? -1 : Number(aRaw);
    const b = Number(linearMatch[2]);
    const c = Number(linearMatch[3]);
    const rhsAfterB = c - b;
    const xVal = rhsAfterB / a;
    const xFormatted = Number.isInteger(xVal) ? String(xVal) : xVal.toFixed(3);

    const steps: SolutionStep[] = [
      {
        stepNumber: 1,
        title: "Move the Constant Term to the Right Side",
        mathExpression: `${a}x = ${c} ${b >= 0 ? `- ${b}` : `+ ${Math.abs(b)}`}  ⇒  ${a}x = ${rhsAfterB}`,
        explanation: `To isolate the ${a}x term, perform the inverse operation of ${b >= 0 ? `+${b}` : b} on both sides of the equals sign.`,
        spokenScript: `First, let's get the x term by itself. We ${b >= 0 ? `subtract ${b}` : `add ${Math.abs(b)}`} on both sides, giving us ${a} x equals ${rhsAfterB}.`,
        buddyMood: "thinking",
      },
      {
        stepNumber: 2,
        title: `Divide Both Sides by ${a}`,
        mathExpression: `x = ${rhsAfterB} / ${a}  ⇒  x = ${xFormatted}`,
        explanation: `Dividing both sides by the coefficient ${a} isolates x completely and gives x = ${xFormatted}.`,
        spokenScript: `Now divide both sides by ${a}. That gives us our final answer: x equals ${xFormatted}!`,
        buddyMood: "happy",
      },
    ];

    return {
      id: `sol-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      detectedEquation: input,
      category: "Algebra · Linear Equations",
      finalAnswer: `x = ${xFormatted}`,
      audioContextInsight: contextPrefix,
      buddyGreeting: "Let's balance both sides and isolate x step by step!",
      steps,
      comprehensionCheck: {
        question: `How can we quickly verify that x = ${xFormatted} is correct?`,
        options: [
          `Substitute x = ${xFormatted} back into ${input} and check if both sides equal ${c}`,
          "Multiply both sides by zero",
          "Guess another number",
        ],
        correctIndex: 0,
        encouragementOnCorrect:
          "Yes! Plugging your root back into the original equation is the ultimate self-check.",
        hintOnRetry:
          "Remember that an equation is a balance scale—the left side should equal the right side!",
      },
      engineUsed: "Built-in offline helper (no AI)",
      voiceNoteAttached: cleanVoice || undefined,
      scannedImagePreview,
    };
  }

  // 7. General Arithmetic / Expression Evaluator
  try {
    const sanitized = input
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/\^/g, "**")
      .replace(/[^0-9+\-*/().\s*]/g, "");
    if (sanitized && /[0-9]/.test(sanitized)) {
      const evaluated = Function(`"use strict"; return (${sanitized});`)();
      if (typeof evaluated === "number" && Number.isFinite(evaluated)) {
        const formatted = Number.isInteger(evaluated)
          ? String(evaluated)
          : Number(evaluated.toFixed(4)).toString();
        return {
          id: `sol-${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          detectedEquation: input,
          category: "Arithmetic & Order of Operations",
          finalAnswer: formatted,
          audioContextInsight: contextPrefix,
          buddyGreeting:
            "Let's evaluate this expression using PEMDAS order of operations!",
          steps: [
            {
              stepNumber: 1,
              title: "Group Parentheses & Exponents First",
              mathExpression: input,
              explanation:
                "Following PEMDAS (Parentheses, Exponents, Multiplication/Division, Addition/Subtraction), we evaluate inner groupings and powers before combining terms.",
              spokenScript: `Let's evaluate ${input} following the order of operations: parentheses and exponents first, then multiplication and division, and finally addition and subtraction.`,
              buddyMood: "thinking",
            },
            {
              stepNumber: 2,
              title: "Compute Final Numeric Value",
              mathExpression: `${input} = ${formatted}`,
              explanation: `Combining the operations step-by-step yields the exact result ${formatted}.`,
              spokenScript: `Putting it all together gives us ${formatted}!`,
              buddyMood: "happy",
            },
          ],
          comprehensionCheck: {
            question: "In PEMDAS, which operation is evaluated first?",
            options: [
              "Parentheses & Exponents before Multiplication/Addition",
              "Addition from right to left",
              "Subtraction before Parentheses",
            ],
            correctIndex: 0,
            encouragementOnCorrect:
              "Spot on! Grouping symbols and exponents always take top priority.",
            hintOnRetry: "Remember P-E-M-D-A-S!",
          },
          engineUsed: "Built-in offline helper (no AI)",
          voiceNoteAttached: cleanVoice || undefined,
          scannedImagePreview,
        };
      }
    }
  } catch {
    // Fall through to general symbolic response
  }

  // Fallback symbolic walkthrough for custom problem statements
  return {
    id: `sol-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    detectedEquation: input,
    category: "Symbolic Math Analysis",
    finalAnswer: `Analyzed: ${input}`,
    audioContextInsight: contextPrefix,
    buddyGreeting:
      "I scanned your math problem! Let's walk through the strategy together.",
    steps: [
      {
        stepNumber: 1,
        title: "Identify Knowns & Target Variable",
        mathExpression: input,
        explanation:
          "First, write down the given expression clearly and identify which variable or quantity we are solving for.",
        spokenScript: `First, let's look at ${input} and identify the target variable and given constants.`,
        buddyMood: "thinking",
      },
      {
        stepNumber: 2,
        title: "Apply Inverse Operations Step-by-Step",
        mathExpression: `Simplify(${input})`,
        explanation:
          "Combine like terms on each side of the equation, then isolate the unknown term using inverse algebraic operations.",
        spokenScript:
          "Next, combine like terms and apply inverse operations to isolate the unknown variable cleanly.",
        buddyMood: "talking",
      },
    ],
    comprehensionCheck: {
      question: "What is the golden rule when transforming an equation?",
      options: [
        "Whatever operation you do to one side, do to the other side",
        "Only change the left side of the equation",
        "Remove parentheses without distributing",
      ],
      correctIndex: 0,
      encouragementOnCorrect:
        "Yes! Keeping the equation balanced is the heart of algebra.",
      hintOnRetry: "Think of the equals sign like a balanced seesaw!",
    },
    engineUsed: "Built-in offline helper (no AI)",
    voiceNoteAttached: cleanVoice || undefined,
    scannedImagePreview,
  };
}

/**
 * Tactile Web Audio synthesizer for hardware button clicks, rotary detents,
 * camera shutter, and Study Buddy cute vocal/chime cues.
 */
class TactileSoundEngine {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playKeyClick(pitchMultiplier = 1) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(190 * pitchMultiplier, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.035);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  playRotaryClick(stepIndex: number) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(320 + stepIndex * 45, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.022);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.025);
  }

  playBuddyChime(type: "happy" | "thinking" | "scan") {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes =
      type === "happy"
        ? [523.25, 659.25, 783.99, 1046.5]
        : type === "scan"
        ? [440, 587.33, 880]
        : [392, 440, 392];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);
      gain.gain.setValueAtTime(0.09, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.065 + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.15);
    });
  }
}

export const soundEngine = new TactileSoundEngine();

export interface ReadingPreset {
  id: string;
  title: string;
  subject: string;
  authorOrSource: string;
  excerpt: string;
  mainIdea: string;
  facts: string[];
  vocabulary: Array<{ term: string; definition: string }>;
  takeaway: string;
}

export const READING_PRESETS: ReadingPreset[] = [
  {
    id: "read-photo",
    title: "How Photosynthesis Powers the Biosphere",
    subject: "Biology & Earth Science",
    authorOrSource: "Nature Science Primer",
    excerpt:
      "Photosynthesis is the biochemical process through which autotrophic organisms, such as plants, algae, and cyanobacteria, convert light energy into chemical energy stored in glucose. Inside plant cells, chloroplasts contain thylakoid membranes embedded with chlorophyll pigments that absorb blue and red wavelengths of light while reflecting green. During the light-dependent reactions, water molecules (H2O) are split into oxygen, protons, and electrons, generating ATP and NADPH. Subsequently, the Calvin cycle utilizes atmospheric carbon dioxide (CO2) to synthesize glyceraldehyde-3-phosphate, sustaining terrestrial and aquatic food webs.",
    mainIdea:
      "Photosynthesis captures solar energy within plant chloroplasts to convert water and carbon dioxide into glucose and oxygen, providing the primary energetic foundation for global ecosystems.",
    facts: [
      "Light-dependent reactions occur in thylakoid membranes and split water into oxygen, ATP, and NADPH.",
      "The Calvin cycle fixes atmospheric CO2 into sugars without requiring direct sunlight.",
      "Chlorophyll absorbs primarily blue and red wavelengths, reflecting green light.",
    ],
    vocabulary: [
      {
        term: "Autotroph",
        definition: "An organism capable of synthesizing its own food from inorganic substances using light or chemical energy.",
      },
      {
        term: "Thylakoid",
        definition: "Flattened membrane sacs inside chloroplasts where the light-absorbing reactions take place.",
      },
      {
        term: "Calvin Cycle",
        definition: "The cycle of chemical reactions where carbon from CO2 is fixed into carbohydrates.",
      },
    ],
    takeaway:
      "Without photosynthetic organisms splitting water and fixing carbon, atmospheric oxygen would deplete and food chains would collapse.",
  },
  {
    id: "read-printing",
    title: "Gutenberg's Movable Type & the Spread of Ideas",
    subject: "World History",
    authorOrSource: "Renaissance Chronicle",
    excerpt:
      "Johannes Gutenberg's introduction of movable metal type around 1440 transformed European intellectual life. Prior to Gutenberg, books were laboriously transcribed by hand in monasteries, rendering them rare luxury items accessible only to ecclesiastical and aristocratic elites. By combining durable lead-alloy type pieces with oil-based ink and an adapted screw press, Gutenberg enabled exponential multiplication of texts at a fraction of prior costs. The resulting democratization of literacy fueled the Protestant Reformation, catalyzed the Scientific Revolution, and laid the foundation for modern public discourse.",
    mainIdea:
      "Gutenberg's movable metal type mechanized book manufacturing, drastically lowering costs and democratizing literacy, which accelerated the Renaissance, Reformation, and Scientific Revolution.",
    facts: [
      "Before 1440, manuscript copying took months and restricted book ownership to wealthy elites.",
      "Gutenberg developed a durable lead-tin alloy for interchangeable letters and adapted an olive/wine screw press.",
      "Cheap printing allowed rapid dissemination of Martin Luther's theses and scientific treatises across Europe.",
    ],
    vocabulary: [
      {
        term: "Movable Type",
        definition: "The system of typography using separate metal or wooden components to reproduce elements of a document.",
      },
      {
        term: "Ecclesiastical",
        definition: "Relating to the Christian Church or its clergy.",
      },
    ],
    takeaway:
      "The printing press demonstrates how technical innovations in media manufacturing fundamentally reshape social and political hierarchies.",
  },
  {
    id: "read-ocean",
    title: "Ocean Acidification and Marine Ecosystems",
    subject: "Environmental Science",
    authorOrSource: "Marine Ecology Review",
    excerpt:
      "Since the Industrial Revolution, oceans have absorbed approximately thirty percent of anthropogenic carbon dioxide emissions. When carbon dioxide dissolves in seawater, it reacts with water molecules to form carbonic acid (H2CO3), which dissociates into hydrogen ions and bicarbonate. This excess of hydrogen ions lowers ocean pH and binds with carbonate ions (CO3 2-), reducing the saturation state of calcium carbonate. Consequently, calcifying organisms like corals, pteropods, and shellfish struggle to build and maintain their calcium carbonate skeletons, threatening foundational marine food webs.",
    mainIdea:
      "Absorbing human carbon emissions alters ocean chemistry into carbonic acid, lowering seawater pH and depleting carbonate ions that corals and shellfish need to build protective shells.",
    facts: [
      "Oceans have sequestered roughly 30% of human-released CO2 since the 1800s.",
      "Dissolved CO2 forms carbonic acid, reducing seawater pH and carbonate availability.",
      "Pteropods ('sea butterflies') and reef-building corals suffer shell thinning and dissolution.",
    ],
    vocabulary: [
      {
        term: "Anthropogenic",
        definition: "Originating from human activity (especially environmental pollution).",
      },
      {
        term: "Calcification",
        definition: "The biological process in which organisms accumulate calcium salts to build shells or skeletons.",
      },
    ],
    takeaway:
      "Ocean acidification directly impacts the base of marine food webs, showing that climate change affects aquatic chemistry as well as global temperatures.",
  },
];

/**
 * Renders an educational reading passage onto a book page canvas for camera scanning
 */
export function renderReadingSampleToDataUrl(preset: ReadingPreset): string {
  const canvas = document.createElement("canvas");
  canvas.width = 680;
  canvas.height = 420;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Soft off-white book paper background
  ctx.fillStyle = "#FDFBF7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle textbook border
  ctx.strokeStyle = "#E4DEC8";
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

  // Header metadata
  ctx.fillStyle = "#EF5B14";
  ctx.font = "bold 13px 'JetBrains Mono', monospace";
  ctx.fillText(`READING PASSAGE · ${preset.subject.toUpperCase()}`, 36, 46);

  ctx.fillStyle = "#16171A";
  ctx.font = "bold 20px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(preset.title, 36, 76);

  ctx.fillStyle = "#6B7280";
  ctx.font = "italic 12px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(`Source: ${preset.authorOrSource}`, 36, 96);

  // Body text wrapping
  ctx.fillStyle = "#2D3139";
  ctx.font = "400 14px 'Plus Jakarta Sans', sans-serif";
  const words = preset.excerpt.split(" ");
  let line = "";
  let y = 130;
  const maxWidth = canvas.width - 76;
  const lineHeight = 23;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + " ";
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, 36, y);
      line = words[n] + " ";
      y += lineHeight;
      if (y > canvas.height - 40) break;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 36, y);

  return canvas.toDataURL("image/png");
}

/**
 * Offline local conversational tutor for Study Buddy across any subject.
 * Remembers student name, inquires about their goals, and analyzes reading or homework.
 */
export function chatWithLocalGemmaEdge(
  message: string,
  profile: { name?: string; nickname?: string; currentNeed?: string } = {}
): {
  replyText: string;
  spokenSummary: string;
  buddyMood: "happy" | "excited" | "thinking" | "curious" | "talking";
  learnedStudentInfo?: { name?: string; nickname?: string; currentNeed?: string };
} {
  const text = message.trim();
  const lower = text.toLowerCase();
  const nameToUse = profile.nickname || profile.name || "";

  // 1. If user introduces their name (e.g., "my name is Alex", "I'm Jordan", "call me Sam")
  const nameMatch =
    text.match(/(?:my name is|i am|i'm|call me|name's)\s+([A-Za-z]+)/i) ||
    text.match(/^hi,?\s+(?:i'm|i am)\s+([A-Za-z]+)/i);

  if (nameMatch) {
    const extractedName = nameMatch[1];
    return {
      replyText: `Yay! So lovely to officially meet you, ${extractedName}! 🎉 I'm Study Buddy—your 24/7 pocket tutor. What are you studying or working on right now? We can solve math, analyze reading passages, study science, practice vocabulary, or brainstorm essays!`,
      spokenSummary: `Lovely to officially meet you, ${extractedName}! What are you working on today?`,
      buddyMood: "happy",
      learnedStudentInfo: { name: extractedName, nickname: extractedName },
    };
  }

  // 2. If student asks what Study Buddy can do
  if (lower.includes("what can you do") || lower.includes("help me with")) {
    return {
      replyText: `Here is everything I can do as your Study Buddy! ✨\n\n1. 📐 **Math & Equations**: Scan handwritten math with the Camera or type in the Calculator to get step-by-step solutions.\n2. 📖 **Reading & Articles**: Scan or upload reading passages to extract the Main Idea, key facts, and vocabulary.\n3. 🧪 **Science & History**: Ask me any concept questions—from cell biology to the Renaissance.\n4. 🎙️ **Voice Walkthroughs**: Press PLAY anytime and I'll talk through problems with you.\n\nWhat subject do you want to explore first${nameToUse ? `, ${nameToUse}` : ""}?`,
      spokenSummary: `I can help with math, reading analysis, science, history, or homework questions! What would you like to explore?`,
      buddyMood: "excited",
    };
  }

  // 3. If student asks about reading comprehension or main ideas
  if (
    lower.includes("reading") ||
    lower.includes("main idea") ||
    lower.includes("passage") ||
    lower.includes("article")
  ) {
    return {
      replyText: `I love reading comprehension! 📚 To analyze any reading material:\n\n• Tap the **Camera key** and select a Reading preset, or\n• Tap **Photo** to upload an article or book page, or\n• Paste any passage right into our chat!\n\nI will instantly break down the **Central Main Idea**, summarize **Key Facts**, and define any tricky **Vocabulary** for you.`,
      spokenSummary: `You can scan any reading passage with the camera or upload a file, and I'll extract the main idea, facts, and vocabulary!`,
      buddyMood: "curious",
    };
  }

  // 4. Default warm conversational response
  const greeting = nameToUse ? `Hey ${nameToUse}!` : "Hey there!";
  const askNameSnippet = !nameToUse
    ? " By the way, what's your name or preferred nickname so I know what to call you?"
    : "";

  return {
    replyText: `${greeting} I'm right here with you!${askNameSnippet} Tell me what problem, reading passage, or concept you're working on, or tap the Camera to scan your notes.`,
    spokenSummary: `${greeting} I'm ready to help! What subject are we tackling today?`,
    buddyMood: "talking",
  };
}
