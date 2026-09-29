"""
Self-contained, zero-dependency QR code generator for Python 3.
Implements ISO/IEC 18004 for byte mode QR codes.
Outputs ultra-crisp vector SVG.
"""

def generate_qr_matrix(text: str, error_level: str = 'M'):
    # Galois Field GF(256) with primitive polynomial 0x11d (285)
    gf_exp = [0] * 512
    gf_log = [0] * 256
    x = 1
    for i in range(255):
        gf_exp[i] = x
        gf_exp[i + 255] = x
        gf_log[x] = i
        x <<= 1
        if x & 256:
            x ^= 285
    gf_log[0] = 0

    def gf_mul(x, y):
        if x == 0 or y == 0:
            return 0
        return gf_exp[gf_log[x] + gf_log[y]]

    def rs_poly(n):
        g = [1]
        for i in range(n):
            ng = [0] * (len(g) + 1)
            for j in range(len(g)):
                ng[j] ^= gf_mul(g[j], gf_exp[i])
                ng[j + 1] ^= g[j]
            g = ng
        return g

    def rs_encode(msg, num_ec):
        gen = rs_poly(num_ec)
        out = list(msg) + [0] * num_ec
        for i in range(len(msg)):
            coef = out[i]
            if coef != 0:
                for j in range(len(gen)):
                    out[i + j] ^= gf_mul(gen[j], coef)
        return out[len(msg):]

    # For text "https://launch1500.surge.sh" (27 bytes), Version 3-M has:
    # Total codewords: 70
    # Data codewords: 44
    # EC codewords: 26 (1 block of 26)
    # Size: 29 x 29
    version = 3
    size = 17 + version * 4  # 29
    total_data_codewords = 44
    ec_codewords = 26

    # Encode data
    data_bytes = text.encode('utf-8')
    bitbuf = []
    def add_bits(val, length):
        for i in range(length - 1, -1, -1):
            bitbuf.append((val >> i) & 1)

    # Mode 0100 = 8-bit byte
    add_bits(4, 4)
    # Character count (8 bits for version 1-9)
    add_bits(len(data_bytes), 8)
    for b in data_bytes:
        add_bits(b, 8)

    # Terminator
    rem = total_data_codewords * 8 - len(bitbuf)
    term = min(4, rem)
    add_bits(0, term)

    # Pad to byte boundary
    while len(bitbuf) % 8 != 0:
        bitbuf.append(0)

    # Pad bytes
    data_words = []
    for i in range(0, len(bitbuf), 8):
        b = 0
        for j in range(8):
            b = (b << 1) | bitbuf[i + j]
        data_words.append(b)

    pad = [0xEC, 0x11]
    p_idx = 0
    while len(data_words) < total_data_codewords:
        data_words.append(pad[p_idx % 2])
        p_idx += 1

    # Error correction
    ec_words = rs_encode(data_words, ec_codewords)
    all_codewords = data_words + ec_words

    # Convert all codewords to bit stream
    final_bits = []
    for w in all_codewords:
        for i in range(7, -1, -1):
            final_bits.append((w >> i) & 1)

    # Remainder bits for Version 3 is 0 bits
    # Matrix setup
    grid = [[None] * size for _ in range(size)]
    is_reserved = [[False] * size for _ in range(size)]

    def set_finder(top, left):
        for r in range(7):
            for c in range(7):
                is_black = (r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4))
                grid[top + r][left + c] = 1 if is_black else 0
                is_reserved[top + r][left + c] = True
        # Separators
        for r in range(-1, 8):
            for c in range(-1, 8):
                nr, nc = top + r, left + c
                if 0 <= nr < size and 0 <= nc < size:
                    is_reserved[nr][nc] = True
                    if grid[nr][nc] is None:
                        grid[nr][nc] = 0

    set_finder(0, 0)
    set_finder(0, size - 7)
    set_finder(size - 7, 0)

    # Alignment pattern for Version 3: center at (22, 22)
    def set_alignment(cr, cc):
        for r in range(-2, 3):
            for c in range(-2, 3):
                nr, nc = cr + r, cc + c
                if grid[nr][nc] is None or not is_reserved[nr][nc]:
                    is_black = (abs(r) == 2 or abs(c) == 2 or (r == 0 and c == 0))
                    grid[nr][nc] = 1 if is_black else 0
                    is_reserved[nr][nc] = True

    set_alignment(22, 22)

    # Timing patterns
    for i in range(size):
        if grid[6][i] is None:
            grid[6][i] = 1 if i % 2 == 0 else 0
            is_reserved[6][i] = True
        if grid[i][6] is None:
            grid[i][6] = 1 if i % 2 == 0 else 0
            is_reserved[i][6] = True

    # Dark module
    grid[4 * version + 9][8] = 1
    is_reserved[4 * version + 9][8] = True

    # Reserve format info areas
    for i in range(9):
        if not is_reserved[8][i]:
            is_reserved[8][i] = True
        if not is_reserved[i][8]:
            is_reserved[i][8] = True
    for i in range(8):
        if not is_reserved[8][size - 1 - i]:
            is_reserved[8][size - 1 - i] = True
        if not is_reserved[size - 1 - i][8]:
            is_reserved[size - 1 - i][8] = True

    # Mask functions
    mask_funcs = [
        lambda r, c: (r + c) % 2 == 0,
        lambda r, c: r % 2 == 0,
        lambda r, c: c % 3 == 0,
        lambda r, c: (r + c) % 3 == 0,
        lambda r, c: ((r // 2) + (c // 3)) % 2 == 0,
        lambda r, c: ((r * c) % 2) + ((r * c) % 3) == 0,
        lambda r, c: (((r * c) % 2) + ((r * c) % 3)) % 2 == 0,
        lambda r, c: (((r + c) % 2) + ((r * c) % 3)) % 2 == 0,
    ]

    # Place data with mask
    def build_matrix_with_mask(mask_idx):
        mat = [row[:] for row in grid]
        mf = mask_funcs[mask_idx]
        bit_idx = 0
        num_bits = len(final_bits)

        c = size - 1
        while c > 0:
            if c == 6:
                c -= 1
            cols = [c, c - 1]
            rows = range(size - 1, -1, -1) if ((size - 1 - c) // 2) % 2 == 0 else range(size)
            for r in rows:
                for col in cols:
                    if not is_reserved[r][col]:
                        val = final_bits[bit_idx] if bit_idx < num_bits else 0
                        bit_idx += 1
                        if mf(r, col):
                            val ^= 1
                        mat[r][col] = val
            c -= 2

        # Format information:
        # Error correction M is 00
        # Format string calculation: (00 << 3) | mask_idx = mask_idx
        fmt_val = mask_idx
        # BCH(15, 5) generator 0x537 = 10100110111
        d = fmt_val << 10
        for i in range(14, 9, -1):
            if d & (1 << i):
                d ^= 0x537 << (i - 10)
        fmt_bits = ((fmt_val << 10) | d) ^ 0x5412

        # Format bits placement
        # Around top-left
        bits = [(fmt_bits >> i) & 1 for i in range(15)]
        # 0-5 -> (8, 0..5)
        for i in range(6):
            mat[8][i] = bits[i]
        mat[8][7] = bits[6]
        mat[8][8] = bits[7]
        mat[7][8] = bits[8]
        for i in range(6):
            mat[5 - i][8] = bits[9 + i]

        # Second copy
        for i in range(8):
            mat[size - 1 - i][8] = bits[i]
        for i in range(7):
            mat[8][size - 7 + i] = bits[8 + i]

        return mat

    # Penalty score evaluator
    def evaluate_penalty(mat):
        penalty = 0
        # Condition 1: 5+ consecutive same color in row/col
        for r in range(size):
            consec = 1
            for c in range(1, size):
                if mat[r][c] == mat[r][c - 1]:
                    consec += 1
                else:
                    if consec >= 5:
                        penalty += 3 + (consec - 5)
                    consec = 1
            if consec >= 5:
                penalty += 3 + (consec - 5)

        for c in range(size):
            consec = 1
            for r in range(1, size):
                if mat[r][c] == mat[r - 1][c]:
                    consec += 1
                else:
                    if consec >= 5:
                        penalty += 3 + (consec - 5)
                    consec = 1
            if consec >= 5:
                penalty += 3 + (consec - 5)

        # Condition 2: 2x2 blocks
        for r in range(size - 1):
            for c in range(size - 1):
                if mat[r][c] == mat[r][c + 1] == mat[r + 1][c] == mat[r + 1][c + 1]:
                    penalty += 3

        # Condition 4: dark ratio
        dark_cnt = sum(row.count(1) for row in mat)
        ratio = (dark_cnt * 100) // (size * size)
        k = abs(ratio - 50) // 5
        penalty += k * 10
        return penalty

    best_mask = 0
    best_penalty = 10**9
    best_mat = None

    for m in range(8):
        mat = build_matrix_with_mask(m)
        pen = evaluate_penalty(mat)
        if pen < best_penalty:
            best_penalty = pen
            best_mask = m
            best_mat = mat

    return best_mat, size

if __name__ == "__main__":
    url = "https://launch1500.surge.sh"
    mat, size = generate_qr_matrix(url)
    
    # Generate Luxury SVG
    border = 4
    total_size = size + 2 * border
    module_px = 12
    dim = total_size * module_px
    
    rects = []
    for r in range(size):
        for c in range(size):
            if mat[r][c] == 1:
                x = (c + border) * module_px
                y = (r + border) * module_px
                rects.append(f'<rect x="{x}" y="{y}" width="{module_px}" height="{module_px}" rx="2" />')
                
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {dim} {dim}" width="100%" height="100%" shape-rendering="geometricPrecision">
  <defs>
    <linearGradient id="qrGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EED59B"/>
      <stop offset="50%" stop-color="#C5A869"/>
      <stop offset="100%" stop-color="#9C7F3A"/>
    </linearGradient>
    <linearGradient id="qrDark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0E1B2D"/>
      <stop offset="100%" stop-color="#080F1A"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="{dim}" height="{dim}" fill="#FAF8F5" rx="16"/>
  <!-- Inner border ring -->
  <rect x="6" y="6" width="{dim-12}" height="{dim-12}" fill="none" stroke="url(#qrGold)" stroke-width="2.5" rx="12" opacity="0.6"/>
  <!-- Modules -->
  <g fill="url(#qrDark)">
    {"".join(rects)}
  </g>
</svg>'''
    
    with open("assets/launch1500-qr.svg", "w", encoding="utf-8") as f:
        f.write(svg)
    print("Generated assets/launch1500-qr.svg successfully!")
