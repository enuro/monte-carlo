/// Лексемы формульного выражения
#[derive(Debug, Clone)]
pub enum Token {
    Num(f64),
    Ident(String),
    Op(char),
    LParen,
    RParen,
    Leq, // <=
    Geq, // >=
    Lt,  // <
    Gt,  // >
}

/// Разбивает строку на токены.
pub fn tokenize(expr: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = expr.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        match chars[i] {
            ' ' | '\t' => { i += 1; }
            '0'..='9' | '.' => {
                let mut s = String::new();
                while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                    s.push(chars[i]);
                    i += 1;
                }
                tokens.push(Token::Num(s.parse().unwrap_or(0.0)));
            }
            'a'..='z' | 'A'..='Z' | '_' => {
                let mut s = String::new();
                while i < chars.len() && (chars[i].is_alphanumeric() || chars[i] == '_') {
                    s.push(chars[i]);
                    i += 1;
                }
                tokens.push(Token::Ident(s));
            }
            '<' if i + 1 < chars.len() && chars[i + 1] == '=' => {
                tokens.push(Token::Leq); i += 2;
            }
            '>' if i + 1 < chars.len() && chars[i + 1] == '=' => {
                tokens.push(Token::Geq); i += 2;
            }
            '<' => { tokens.push(Token::Lt);     i += 1; }
            '>' => { tokens.push(Token::Gt);     i += 1; }
            '(' => { tokens.push(Token::LParen); i += 1; }
            ')' => { tokens.push(Token::RParen); i += 1; }
            c @ ('+' | '-' | '*' | '/' | '^') => {
                tokens.push(Token::Op(c)); i += 1;
            }
            _ => { i += 1; } // пропускаем неизвестные символы
        }
    }
    tokens
}

// ── Рекурсивный парсер-нисходящий ─────────────────────────────────────────────

struct Parser<'a> {
    tokens: &'a [Token],
    pos: usize,
    x: f64,
    y: f64,
}

impl<'a> Parser<'a> {
    fn new(tokens: &'a [Token], x: f64, y: f64) -> Self {
        Self { tokens, pos: 0, x, y }
    }

    #[inline]
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.pos)
    }

    #[inline]
    fn consume(&mut self) -> Option<&Token> {
        let t = self.tokens.get(self.pos);
        self.pos += 1;
        t
    }

    /// Верхний уровень: выражение [оператор_сравнения выражение]
    fn parse_comparison(&mut self) -> Option<bool> {
        let left = self.parse_expr()?;
        match self.peek() {
            Some(Token::Leq) => { self.consume(); Some(left <= self.parse_expr()?) }
            Some(Token::Geq) => { self.consume(); Some(left >= self.parse_expr()?) }
            Some(Token::Lt)  => { self.consume(); Some(left <  self.parse_expr()?) }
            Some(Token::Gt)  => { self.consume(); Some(left >  self.parse_expr()?) }
            _ => Some(left != 0.0), // интерпретируем ненулевое значение как true
        }
    }

    fn parse_expr(&mut self) -> Option<f64> {
        let mut lhs = self.parse_term()?;
        loop {
            match self.peek() {
                Some(Token::Op('+')) => { self.consume(); lhs += self.parse_term()?; }
                Some(Token::Op('-')) => { self.consume(); lhs -= self.parse_term()?; }
                _ => break,
            }
        }
        Some(lhs)
    }

    fn parse_term(&mut self) -> Option<f64> {
        let mut lhs = self.parse_power()?;
        loop {
            match self.peek() {
                Some(Token::Op('*')) => { self.consume(); lhs *= self.parse_power()?; }
                Some(Token::Op('/')) => {
                    self.consume();
                    let rhs = self.parse_power()?;
                    if rhs == 0.0 { return None; } // защита от деления на ноль
                    lhs /= rhs;
                }
                _ => break,
            }
        }
        Some(lhs)
    }

    fn parse_power(&mut self) -> Option<f64> {
        let base = self.parse_unary()?;
        if let Some(Token::Op('^')) = self.peek() {
            self.consume();
            Some(base.powf(self.parse_unary()?))
        } else {
            Some(base)
        }
    }

    fn parse_unary(&mut self) -> Option<f64> {
        match self.peek() {
            Some(Token::Op('-')) => { self.consume(); Some(-self.parse_primary()?) }
            Some(Token::Op('+')) => { self.consume(); self.parse_primary() }
            _ => self.parse_primary(),
        }
    }

    fn parse_primary(&mut self) -> Option<f64> {
        match self.peek()? {
            Token::Num(_) => {
                if let Token::Num(n) = self.consume()? { Some(*n) } else { None }
            }
            Token::Ident(s) => {
                let name = s.clone();
                self.consume();
                match name.as_str() {
                    "x"        => Some(self.x),
                    "y"        => Some(self.y),
                    "pi" | "PI" => Some(std::f64::consts::PI),
                    "e"  | "E"  => Some(std::f64::consts::E),
                    func => {
                        // Вызов функции: func(arg)
                        if let Some(Token::LParen) = self.peek() {
                            self.consume();
                            let arg = self.parse_expr()?;
                            if let Some(Token::RParen) = self.peek() { self.consume(); }
                            match func {
                                "sqrt" => Some(arg.sqrt()),
                                "sin"  => Some(arg.sin()),
                                "cos"  => Some(arg.cos()),
                                "tan"  => Some(arg.tan()),
                                "abs"  => Some(arg.abs()),
                                "ln"   => Some(arg.ln()),
                                "log"  => Some(arg.log10()),
                                "exp"  => Some(arg.exp()),
                                "floor" => Some(arg.floor()),
                                "ceil"  => Some(arg.ceil()),
                                _ => None,
                            }
                        } else {
                            None
                        }
                    }
                }
            }
            Token::LParen => {
                self.consume();
                let v = self.parse_expr()?;
                if let Some(Token::RParen) = self.peek() { self.consume(); }
                Some(v)
            }
            _ => None,
        }
    }
}

// ── Публичный API ──────────────────────────────────────────────────────────────

/// Вычислить предтокенизированную формулу в точке (x, y).
/// Вызывать в горячем цикле — без аллокации токенов.
#[inline]
pub fn eval_tokens(tokens: &[Token], x: f64, y: f64) -> bool {
    let mut parser = Parser::new(tokens, x, y);
    parser.parse_comparison().unwrap_or(false)
}

